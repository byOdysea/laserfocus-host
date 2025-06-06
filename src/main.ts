import 'dotenv/config'; // Ensure this is at the very top
console.log('--- [main.ts] Script execution started ---');
import { app, BrowserWindow, ipcMain, screen, Display, IpcMainEvent } from 'electron';
import * as logger from './logger';
import { StateGraph, END, START, StateGraphArgs } from '@langchain/langgraph'; // ReducerChannel removed
import { HumanMessage, AIMessage, BaseMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { tool, DynamicStructuredTool, StructuredTool } from '@langchain/core/tools';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { Runnable } from '@langchain/core/runnables';
import { z } from 'zod'; // For tool schema definition
import * as path from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto'; // Added for UUID generation



const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

class AthenaWidgetWindow {
    public window: BrowserWindow;

    constructor(primaryDisplay: Display) {
        this.window = new BrowserWindow({
            width: 350, // Made smaller
            height: 250, // Made smaller
            webPreferences: {
                preload: path.join(__dirname, '../AthenaWidget/preload.js'),
                nodeIntegration: true,
                contextIsolation: true,
            },
            frame: false,
            transparent: true,
            vibrancy: 'sidebar',
            x: primaryDisplay.workArea.x + primaryDisplay.workAreaSize.width - 350 - 20, // Top-right X
            y: primaryDisplay.workArea.y + 20, // Top-right Y
            alwaysOnTop: false,
        });
    }

    init(): void {
        if (VITE_DEV_SERVER_URL) {
            this.window.loadURL(`${VITE_DEV_SERVER_URL}/src/AthenaWidget/index.html`);
        } else {
            if (!process.env.DIST) {
                logger.error('CRITICAL: process.env.DIST is not defined. Cannot load AthenaWidget HTML.');
                app.quit();
                return; 
            }
            this.window.loadFile(path.join(process.env.DIST, 'renderer/athenaWidget.html'));
        }
        // logger.info('[AthenaWidgetWindow] Attempting to open DevTools for AthenaWidget...');
        // this.window.webContents.openDevTools({ mode: 'detach' });
        // logger.info('[AthenaWidgetWindow] Called openDevTools for AthenaWidget.');
    }

    sendConversationUpdate(type: string, content: string): void {
        if (this.window && this.window.webContents && !this.window.isDestroyed()) {
            this.window.webContents.send('conversation-update', { type, content });
        }
    }
}

class InputPill {
    public window: BrowserWindow;

    constructor(primaryDisplay: Display) {
        this.window = new BrowserWindow({
            width: 500,
            height: 70,
            webPreferences: {
                preload: path.join(__dirname, '../InputPill/preload.js'),
                nodeIntegration: true, 
                contextIsolation: true,
            },
            frame: false,
            transparent: true, // Vibrancy removed for full transparency
            x: primaryDisplay.workArea.x + Math.round(primaryDisplay.workAreaSize.width / 2 - 500 / 2),
            y: primaryDisplay.workArea.y + Math.round(primaryDisplay.workAreaSize.height * 0.85) - Math.round(70 / 2), // Centered towards bottom
            alwaysOnTop: true,
        });
    }

    init(): void {
        if (VITE_DEV_SERVER_URL) {
            this.window.loadURL(`${VITE_DEV_SERVER_URL}/src/InputPill/index.html`);
        } else {
            if (!process.env.DIST) {
                logger.error('CRITICAL: process.env.DIST is not defined. Cannot load InputPill HTML.');
                app.quit();
                return; 
            }
            this.window.loadFile(path.join(process.env.DIST, 'renderer/inputPill.html'));
        }
        // logger.info('[InputPill] Attempting to open DevTools for InputPill...');
        // this.window.webContents.openDevTools({ mode: 'detach' });
        // logger.info('[InputPill] Called openDevTools for InputPill.');
    }
}

interface OpenWindowInfo {
    id: string;
    url: string;
    title?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

// Corrected AgentState: Removed redundant top-level 'windows'
interface AgentState {
    messages: BaseMessage[];
    canvas: {
        windows: OpenWindowInfo[];
        // other canvas properties can be added here later
    };
}

const openWindowSchema = z.object({
    url: z.string().describe("The URL to open in the new browser window. Must be a valid URL string (e.g., https://www.example.com)."),
    title: z.string().optional().describe("Optional title for the new window."),
    x: z.number().optional().describe("Optional x coordinate for the window position."),
    y: z.number().optional().describe("Optional y coordinate for the window position."),
    width: z.number().optional().describe("Optional width for the window."),
    height: z.number().optional().describe("Optional height for the window."),
});

const closeWindowSchema = z.object({
    id: z.string().describe("The ID of the browser window to close."),
});

class CanvasEngine {
    private apiKey: string;
    private modelName: string; // Restored modelName property
    private llm: Runnable; // Changed type to Runnable
    private tools: StructuredTool[];
    private graph: Runnable<AgentState, AgentState>;
    private openBrowserWindows: Map<string, BrowserWindow> = new Map();

    constructor(apiKey: string | undefined, modelName: string, externalTools: StructuredTool[] = []) {
        if (!apiKey) {
            logger.error("GOOGLE_API_KEY is not set. Please check your .env file or environment variables.");
            throw new Error("GOOGLE_API_KEY is not set.");
        }
        this.apiKey = apiKey;
        this.modelName = modelName; // Ensure modelName is assigned

        const openWindowTool = new DynamicStructuredTool({
            name: "open_browser_window",
            description: "Opens a new browser window with the specified URL and optional geometry and title. Returns information about the opened window including its ID, URL, title, and geometry.",
            schema: openWindowSchema,
            func: async (args: z.infer<typeof openWindowSchema>) => this.coreOpenWindow(args),
        });
        
        const closeWindowTool = new DynamicStructuredTool({
            name: "close_browser_window",
            description: "Closes an open browser window using its ID.",
            schema: closeWindowSchema,
            func: async (args: z.infer<typeof closeWindowSchema>) => this.coreCloseWindow(args),
        });
        
        // TODO: Add other window management tools (close, navigate, resize/move, list) here
        
        this.tools = [...externalTools, openWindowTool, closeWindowTool]; 

        this.llm = new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            model: this.modelName, // Corrected from modelName to model
        }).bindTools(this.tools);

        this.graph = this._buildGraph();
    }

    private async coreOpenWindow(
        args: z.infer<typeof openWindowSchema>
    ): Promise<OpenWindowInfo> {
        const { url, title } = args;
        let { x, y, width, height } = args; // Make them mutable
        const id = crypto.randomUUID();

        if (x === undefined || y === undefined || width === undefined || height === undefined) {
            const { workArea } = screen.getPrimaryDisplay();
            const generalMargin = 20;

            // Athena Widget approx dimensions and position
            const athenaWidgetWidth = 350;
            const athenaWidgetHeight = 250; // User updated height
            const athenaWidgetX = workArea.x + workArea.width - athenaWidgetWidth - generalMargin;
            const athenaWidgetY = workArea.y + generalMargin;

            // Input Pill approx dimensions and position
            const inputPillHeight = 70;
            const inputPillWidth = 500;
            const inputPillY = workArea.y + Math.round(workArea.height * 0.85) - Math.round(inputPillHeight / 2);
            // const inputPillX = workArea.x + Math.round(workArea.width / 2 - inputPillWidth / 2); // Not directly needed

            const defaultX = workArea.x + generalMargin;
            const defaultY = athenaWidgetY; // Align top with Athena widget's top
            const defaultWidth = athenaWidgetX - defaultX - generalMargin; // Space to the left of Athena
            const defaultHeight = inputPillY - defaultY - generalMargin; // Space above Input Pill

            x = x === undefined ? defaultX : x;
            y = y === undefined ? defaultY : y;
            width = width === undefined ? Math.max(200, defaultWidth) : width; // Ensure a minimum width
            height = height === undefined ? Math.max(200, defaultHeight) : height; // Ensure a minimum height
            logger.info(`[CanvasEngine] No window geometry provided. Using calculated defaults: x=${x}, y=${y}, w=${width}, h=${height}`);
        }

        const win = new BrowserWindow({
            x: x,
            y: y,
            width: width, 
            height: height,
            title: title || url, 
            webPreferences: {
                nodeIntegration: false, 
                contextIsolation: true,
                sandbox: true, // Recommended for loading external content
                // preload: path.join(__dirname, 'preload-external-window.js'), // Optional: if you need a preload script
            },
            show: false, 
            frame: false,
        });

        win.once('ready-to-show', () => {
            win.show();
        });
        
        try {
            await win.loadURL(url);
        } catch (error) {
            logger.error(`[CanvasEngine] Error loading URL ${url} in window ${id}:`, error);
            // Clean up the window if URL loading fails
            if (!win.isDestroyed()) {
                win.close();
            }
            this.openBrowserWindows.delete(id); // Ensure it's removed if set before error
            throw new Error(`Failed to load URL: ${url}. Error: ${(error as Error).message}`);
        }


        this.openBrowserWindows.set(id, win);
        logger.info(`[CanvasEngine] Opened window ${id} for URL: ${url}. Title: ${win.getTitle()}`);

        win.on('closed', () => {
            logger.info(`[CanvasEngine] Window ${id} closed event fired.`);
            this.openBrowserWindows.delete(id); // Remove from internal tracking
            // Note: Agent graph state (canvas.windows) is updated via _updateCanvasStateFromToolsNode for tool-initiated closes.
            // User-initiated closes are not yet directly synchronized back to the graph state in real-time.
        });

        const bounds = win.getBounds();
        return { id, url, title: win.getTitle(), x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }

    private coreCloseWindow(args: { id: string }): { id: string; status: 'closed' | 'not_found' } {
        const { id } = args;
        const windowToClose = this.openBrowserWindows.get(id);
        if (windowToClose) {
            logger.info(`[CanvasEngine coreCloseWindow] Attempting to close window ${id}`);
            windowToClose.destroy(); // Use destroy for more forceful closure
            // win.on('closed') will handle deleting from this.openBrowserWindows
            logger.info(`[CanvasEngine coreCloseWindow] Window ${id} destroyed.`);
            return { id, status: 'closed' };
        } else {
            logger.warn(`[CanvasEngine coreCloseWindow] Window ${id} not found.`);
            return { id, status: 'not_found' };
        }
    }
    
    private _defineAgentState(): StateGraphArgs<AgentState>["channels"] {
        return {
            messages: {
                value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
                default: () => [] as BaseMessage[],
            },
            // The 'canvas' channel uses ReducerChannel to manage its state.
            // The reducer function defines how updates to this channel are merged.
            // The default factory provides the initial state for this channel.
            canvas: {
                value: (
                    currentCanvasState: { windows: OpenWindowInfo[] }, 
                    updatePatch?: Partial<{ windows: OpenWindowInfo[] }> | null
                ): { windows: OpenWindowInfo[] } => {
                    if (updatePatch && updatePatch.windows !== undefined) {
                        logger.debug('[CanvasEngine _defineAgentState canvas.value] Updating canvas state with new windows:', updatePatch.windows);
                        return { ...currentCanvasState, windows: updatePatch.windows };
                    }
                    logger.debug('[CanvasEngine _defineAgentState canvas.value] No update to canvas windows, returning current state:', currentCanvasState);
                    return currentCanvasState;
                },
                default: () => ({ windows: [] }),
            },
        };
    }

    private async _callAgentNode(state: AgentState): Promise<{ messages: BaseMessage[] }> {
        const currentWindowsInfo = state.canvas?.windows || [];
        const windowListString = currentWindowsInfo.length > 0 
            ? currentWindowsInfo.map(w => `- ID: ${w.id}, URL: ${w.url}, Title: ${w.title || 'N/A'}, Geometry: ${w.width}x${w.height} at (${w.x},${w.y})`).join('\n')
            : 'No browser windows are currently open.';

        const systemPromptContent = `You are a helpful assistant managing an application canvas.
You can open, close, and manage browser windows on behalf of the user.
Keep track of the open windows and use their information to fulfill user requests.

Current Open Browser Windows:
${windowListString}

Available tools: open_browser_window.
When a window is opened, you will receive its ID, URL, title, and geometry. Use this information for subsequent operations.`;

        const messagesWithContext: BaseMessage[] = [
            new SystemMessage(systemPromptContent),
            ...state.messages // Append existing conversation messages
        ];
        
        logger.info(`[CanvasEngine] Calling LLM. Current state messages count: ${state.messages.length}, Canvas windows count: ${currentWindowsInfo.length}`);
        logger.debug(`[CanvasEngine] Messages sent to LLM: ${JSON.stringify(messagesWithContext.map(m => ({type: m.constructor.name, content: m.content})))}`);

        const response = await this.llm.invoke(messagesWithContext);
        logger.info(`[CanvasEngine] LLM raw response: ${JSON.stringify(response.content)}`);
        return { messages: [response] };
    }

    private _shouldContinueNode(state: AgentState): "continue" | "__end__" {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage && (lastMessage as AIMessage).tool_calls && (lastMessage as AIMessage).tool_calls!.length > 0) {
            logger.info("[CanvasEngine] Decision: Continue to tools node (routing via 'continue' key).");
            return "continue";
        }
        logger.info("[CanvasEngine] Decision: End graph execution.");
        return "__end__";
    }

    private _updateCanvasStateFromToolsNode(state: AgentState): Partial<AgentState> {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage && lastMessage._getType() === "tool") {
            const toolMessage = lastMessage as ToolMessage;
            // ToolNode's output (toolMessage.content) can be a single stringified JSON if one tool was called,
            // or an array of stringified JSONs if multiple tools were called in parallel.
            // We'll normalize it to an array for consistent processing.
            const toolOutputsRaw = Array.isArray(toolMessage.content) ? toolMessage.content : [toolMessage.content];
            
            let currentWindows = [...(state.canvas?.windows || [])];
            let windowsChanged = false;

            toolOutputsRaw.forEach(outputContentString => {
                if (typeof outputContentString === 'string') {
                    try {
                        const parsedOutput = JSON.parse(outputContentString);

                        // Check if it's from open_browser_window (heuristic based on expected properties)
                        if (parsedOutput.id && parsedOutput.url && typeof parsedOutput.x === 'number' && parsedOutput.title && parsedOutput.status === undefined) { 
                            const openWindowInfo = parsedOutput as OpenWindowInfo;
                            const existingWindowIndex = currentWindows.findIndex(w => w.id === openWindowInfo.id);
                            if (existingWindowIndex > -1) {
                                currentWindows[existingWindowIndex] = openWindowInfo;
                            } else {
                                currentWindows.push(openWindowInfo);
                            }
                            windowsChanged = true;
                            logger.info(`[CanvasEngine _updateCanvasStateFromToolsNode] Added/Updated window ${openWindowInfo.id} in canvas state.`);
                        }
                        // Check if it's from close_browser_window (heuristic based on expected properties)
                        else if (parsedOutput.id && parsedOutput.status === 'closed') { 
                            const closeWindowOutput = parsedOutput as { id: string; status: 'closed' | 'not_found' };
                            const initialLength = currentWindows.length;
                            currentWindows = currentWindows.filter(w => w.id !== closeWindowOutput.id);
                            if (currentWindows.length < initialLength) {
                                windowsChanged = true;
                                logger.info(`[CanvasEngine _updateCanvasStateFromToolsNode] Removed window ${closeWindowOutput.id} from canvas state.`);
                            }
                        }
                    } catch (e) {
                        logger.warn('[CanvasEngine _updateCanvasStateFromToolsNode] Failed to parse tool message content as JSON or not a recognized tool output:', e, 'Content:', outputContentString);
                    }
                } else {
                    logger.warn('[CanvasEngine _updateCanvasStateFromToolsNode] Encountered non-string content in tool outputs:', outputContentString);
                }
            });

            if (windowsChanged) {
                logger.info(`[CanvasEngine _updateCanvasStateFromToolsNode] Canvas windows state updated. New count: ${currentWindows.length}`);
                return { canvas: { windows: currentWindows } };
            }
        }
        logger.debug('[CanvasEngine _updateCanvasStateFromToolsNode] No relevant tool messages to process for canvas state update or no changes made.');
        return {}; // No change
    }

    private _buildGraph(): Runnable<AgentState, AgentState> {
        const workflow = new StateGraph<AgentState>({ channels: this._defineAgentState() });
        const toolNode = new ToolNode(this.tools);

        workflow.addNode("agent", this._callAgentNode.bind(this));
        workflow.addNode("tools", toolNode); // Use ToolNode directly
        workflow.addNode("_update_canvas_state", this._updateCanvasStateFromToolsNode.bind(this));

        workflow.addEdge(START, "agent" as any);
        workflow.addConditionalEdges(
            "agent" as any,
            this._shouldContinueNode.bind(this),
            {
                continue: "tools" as any, // Agent requests tool call, go to ToolNode
                "__end__": END, // Map our custom string key to the LangGraph END symbol
            }
        );
        // After ToolNode runs, its output (ToolMessages) is merged into state.messages.
        // Then, go to our custom node to update canvas.windows if needed.
        workflow.addEdge("tools" as any, "_update_canvas_state" as any);
        // After updating canvas state (or if no update was needed), go back to the agent.
        workflow.addEdge("_update_canvas_state" as any, "agent" as any);
        return workflow.compile() as any;
    }

    async invoke(userInput: string, config: { recursionLimit?: number } = { recursionLimit: 25 }): Promise<AgentState> {
        // Initialize state with the user input and an empty canvas
        const initialState: AgentState = { 
            messages: [new HumanMessage(userInput)],
            canvas: { windows: [] } 
        };
        logger.info(`[CanvasEngine] Invoking graph with initial input: "${userInput}"`);
        return await this.graph.invoke(initialState, config);
    }
}


let athenaWidget: AthenaWidgetWindow | undefined;
let inputPill: InputPill | undefined;
let canvasEngineInstance: CanvasEngine | undefined;

const initializeApp = async (): Promise<void> => {
    logger.info(`[initializeApp] Current NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`[initializeApp] VITE_DEV_SERVER_URL: ${VITE_DEV_SERVER_URL}`);
    logger.info(`[initializeApp] DIST path: ${process.env.DIST}`);
    logger.info(`[initializeApp] __dirname: ${__dirname}`);


    const primaryDisplay: Display = screen.getPrimaryDisplay();
    
    inputPill = new InputPill(primaryDisplay);
    inputPill.init();

    athenaWidget = new AthenaWidgetWindow(primaryDisplay);
    athenaWidget.init();

    try {
        canvasEngineInstance = new CanvasEngine(process.env.GOOGLE_API_KEY, 'gemini-1.5-flash-latest', []); 
        logger.info('[initializeApp] CanvasEngine initialized successfully.');
    } catch (error) {
        logger.error('[initializeApp] Failed to initialize CanvasEngine:', error);
        // Optionally, inform the user through a dialog or quit the app
        // app.quit();
        return;
    }


    ipcMain.on('run-agent', async (event: IpcMainEvent, query: string) => {
        logger.info(`[ipcMain] Received 'run-agent' with query: "${query}"`);
        if (!canvasEngineInstance) {
            logger.error("[ipcMain] CanvasEngine not initialized! Cannot run agent.");
            // Send error back to InputPill
            if (inputPill && inputPill.window && !inputPill.window.isDestroyed()) {
                inputPill.window.webContents.send('agent-response', "Error: Agent not initialized.");
            }
            if (athenaWidget) {
                 athenaWidget.sendConversationUpdate('agent', "Error: Agent not initialized.");
            }
            return;
        }
        try {
            if (!athenaWidget) {
                logger.error("[ipcMain] AthenaWidget not initialized!");
                return;
            }
            if (!inputPill || !inputPill.window || inputPill.window.isDestroyed()) {
                logger.error("[ipcMain] InputPill not initialized or window destroyed!");
                return;
            }

            athenaWidget.sendConversationUpdate('user', query);
            const agentResponseState = await canvasEngineInstance.invoke(query);
            logger.info(`[ipcMain] Agent final response state: ${JSON.stringify(agentResponseState, null, 2)}`);

            let responseContent = "No direct response from agent."; // Default if no clear content
            if (agentResponseState && agentResponseState.messages && Array.isArray(agentResponseState.messages)) {
                const lastMessage = agentResponseState.messages[agentResponseState.messages.length -1];
                if (lastMessage) {
                    if (lastMessage.content && typeof lastMessage.content === 'string') {
                        responseContent = lastMessage.content;
                    } else if ((lastMessage as AIMessage).tool_calls && (lastMessage as AIMessage).tool_calls!.length > 0) {
                        // If the last message is an AIMessage with tool calls, summarize the action
                        const toolCallSummary = (lastMessage as AIMessage).tool_calls!.map(tc => 
                            `Called tool '${tc.name}' with args ${JSON.stringify(tc.args)}`
                        ).join('; ');
                        responseContent = toolCallSummary;
                    } else if (lastMessage.content) {
                         // Fallback for other complex content types
                        responseContent = JSON.stringify(lastMessage.content);
                    }
                }
            }
            
            if (inputPill && !inputPill.window.isDestroyed()) {
                inputPill.window.webContents.send('agent-response', responseContent);
            }
            if (athenaWidget) {
                 athenaWidget.sendConversationUpdate('agent', responseContent);
            }

        } catch (e: any) {
            logger.error('[ipcMain] Error running CanvasEngine agent:', e.message, e.stack);
            const errorMessage = `Error: ${e.message}`;
            if (inputPill && inputPill.window && !inputPill.window.isDestroyed()) {
                inputPill.window.webContents.send('agent-response', errorMessage);
            }
            if (athenaWidget) {
                athenaWidget.sendConversationUpdate('user', query); 
                athenaWidget.sendConversationUpdate('agent', errorMessage);
            }
        }
    });
};

app.whenReady().then(() => {
    logger.info("[App] Electron is ready. Calling initializeApp.");
    initializeApp();
}).catch(e => {
    logger.error("[App] Error during app.whenReady or initializeApp:", e);
});


app.on('window-all-closed', () => {
    logger.info("[App] All windows closed.");
    if (process.platform !== 'darwin') {
        logger.info("[App] Quitting application (not macOS).");
        app.quit();
    }
});

app.on('activate', () => {
    logger.info("[App] 'activate' event received.");
    if (BrowserWindow.getAllWindows().length === 0) {
        logger.info("[App] No windows open, calling initializeApp.");
        initializeApp();
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // It's generally recommended to terminate the process after an uncaught exception
    // For a desktop app, you might log and attempt a graceful shutdown or notify the user
    // For now, just logging. Consider app.quit() or similar for production.
});