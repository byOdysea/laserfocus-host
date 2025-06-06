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
            width: 400,
            height: 500,
            webPreferences: {
                preload: path.join(__dirname, '../AthenaWidget/preload.js'),
                nodeIntegration: true,
                contextIsolation: true,
            },
            frame: false,
            transparent: true,
            vibrancy: 'sidebar',
            x: Math.round(primaryDisplay.workAreaSize.width / 2 - 200),
            y: primaryDisplay.workArea.y + Math.round(primaryDisplay.workAreaSize.height * 0.1) + 80,
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
            transparent: true,
            vibrancy: 'under-window',
            x: Math.round(primaryDisplay.workAreaSize.width / 2 - 250),
            y: primaryDisplay.workArea.y + Math.round(primaryDisplay.workAreaSize.height * 0.1),
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
        
        // TODO: Add other window management tools (close, navigate, resize/move, list) here
        
        this.tools = [...externalTools, openWindowTool]; 

        this.llm = new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            model: this.modelName, // Corrected from modelName to model
        }).bindTools(this.tools);

        this.graph = this._buildGraph();
    }

    private async coreOpenWindow(
        args: z.infer<typeof openWindowSchema>
    ): Promise<OpenWindowInfo> {
        const { url, title, x, y, width, height } = args;
        const id = crypto.randomUUID();

        const win = new BrowserWindow({
            x: x, // If undefined, Electron will use default placement
            y: y, // If undefined, Electron will use default placement
            width: width || 1024, // Default width if not specified
            height: height || 768, // Default height if not specified
            title: title || url, 
            webPreferences: {
                nodeIntegration: false, 
                contextIsolation: true,
                sandbox: true, // Recommended for loading external content
                // preload: path.join(__dirname, 'preload-external-window.js'), // Optional: if you need a preload script
            },
            show: false, 
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
            this.openBrowserWindows.delete(id);
            logger.info(`[CanvasEngine] Window ${id} closed and removed from tracking.`);
            // TODO: Implement state update to remove this window from AgentState.canvas.windows
            // This requires a mechanism for the graph to react to external events or for tools
            // to be called periodically to sync state. For now, it's just removed from local tracking.
        });

        const bounds = win.getBounds();
        const actualTitle = win.getTitle(); 

        return {
            id,
            url,
            title: actualTitle,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        };
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

    // _callToolNode is removed as ToolNode handles tool execution directly.

    private _updateCanvasStateFromToolsNode(state: AgentState): Partial<AgentState> {
        let newWindowInfos: OpenWindowInfo[] = [];
        let invokingAIMessage: AIMessage | null = null;
        let numToolCallsInAIMessage = 0;

        // Iterate backwards to find the last AIMessage that likely triggered the tools
        for (let i = state.messages.length - 1; i >= 0; i--) {
            const msg = state.messages[i];
            if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
                // Check if the messages immediately following are the corresponding ToolMessages
                // This assumes ToolNode adds ToolMessages directly after the AIMessage that called them.
                let allToolMessagesPresent = true;
                if (state.messages.length > i + msg.tool_calls.length) {
                    for (let j = 0; j < msg.tool_calls.length; j++) {
                        const nextMessage = state.messages[i + 1 + j];
                        if (!(nextMessage instanceof ToolMessage) || nextMessage.tool_call_id !== msg.tool_calls[j].id) {
                            allToolMessagesPresent = false;
                            break;
                        }
                    }
                } else {
                    allToolMessagesPresent = false; // Not enough messages after AI message for all tool calls
                }

                if (allToolMessagesPresent) {
                    invokingAIMessage = msg;
                    numToolCallsInAIMessage = msg.tool_calls.length;
                    break; // Found the relevant AIMessage and its ToolMessages
                }
            }
        }

        if (!invokingAIMessage) {
            logger.debug('[CanvasEngine _updateCanvasStateFromToolsNode] No recent AIMessage with corresponding ToolMessages found. No canvas update from tools.');
            return {}; // No canvas update needed or tools not yet processed by this logic path
        }

        // Extract the ToolMessages that were added by ToolNode
        const toolMessagesStartIndex = state.messages.indexOf(invokingAIMessage) + 1;
        const recentToolMessages = state.messages.slice(toolMessagesStartIndex, toolMessagesStartIndex + numToolCallsInAIMessage);

        for (const toolMessage of recentToolMessages) {
            if (!(toolMessage instanceof ToolMessage)) continue; // Should not happen based on above check

            // Find the original tool call from the AIMessage that this ToolMessage corresponds to
            const originalToolCall = invokingAIMessage.tool_calls!.find(tc => tc.id === toolMessage.tool_call_id);

            if (originalToolCall && originalToolCall.name === 'open_browser_window') {
                try {
                    // The content of the ToolMessage from open_browser_window is the JSON string of OpenWindowInfo
                    const windowInfo = JSON.parse(toolMessage.content as string) as OpenWindowInfo;
                    newWindowInfos.push(windowInfo);
                    logger.debug('[CanvasEngine _updateCanvasStateFromToolsNode] Parsed windowInfo for canvas update:', windowInfo);
                } catch (e) {
                    logger.error('[CanvasEngine _updateCanvasStateFromToolsNode] Error parsing OpenWindowInfo from ToolMessage content:', e, toolMessage.content);
                }
            }
        }

        if (newWindowInfos.length > 0) {
            const updatedWindows = [...(state.canvas?.windows || []), ...newWindowInfos];
            logger.info('[CanvasEngine _updateCanvasStateFromToolsNode] Updating canvas windows. New count:', updatedWindows.length);
            logger.debug('[CanvasEngine _updateCanvasStateFromToolsNode] Updated canvas windows details:', updatedWindows);
            // Return only the canvas part to update, messages are already updated by ToolNode
            return { canvas: { windows: updatedWindows } }; 
        }
        
        logger.debug('[CanvasEngine _updateCanvasStateFromToolsNode] No open_browser_window tool calls found in recent ToolMessages.');
        return {}; // No canvas update needed from this node
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