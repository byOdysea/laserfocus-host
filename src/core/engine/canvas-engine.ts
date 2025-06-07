// src/engine/canvas-engine.ts
import { BrowserWindow, screen, Rectangle } from 'electron';
import { z } from 'zod';
import { openWindowSchema, closeWindowSchema, resizeAndMoveWindowSchema } from './tools/canvas-tool-schemas';
import { tool } from "@langchain/core/tools";
import { BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIChatCallOptions } from "@langchain/google-genai";
import { StateGraph, START, END } from "@langchain/langgraph";
import { Runnable } from "@langchain/core/runnables";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { StructuredTool } from '@langchain/core/tools';
import logger from '../../utils/logger';


export interface CanvasWindowState {
    id: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
}

export interface CanvasState {
    windows: CanvasWindowState[];
}

export interface AgentState {
    messages: BaseMessage[];
    canvas: CanvasState;
}

export class CanvasEngine {
    private apiKey: string;
    private modelName: string;
    private screenWidth: number;
    private screenHeight: number;
    private llm: Runnable<BaseLanguageModelInput, AIMessageChunk, GoogleGenerativeAIChatCallOptions>;
    private tools: StructuredTool[];
    private graph: Runnable<AgentState, AgentState>;
    private _currentMessages: BaseMessage[];
    private _currentCanvasState: CanvasState;
    private currentOpenWindows: Map<string, BrowserWindow> = new Map();
    private workArea: Rectangle;
    private inputPillBounds: Rectangle | undefined;
    private athenaWidgetBounds: Rectangle | undefined;

    constructor(
        apiKey: string | undefined, 
        modelName: string, 
        externalTools: StructuredTool[] = [],
        inputPillWindow?: BrowserWindow,
        athenaWidgetWindow?: BrowserWindow
    ) {
        this.workArea = screen.getPrimaryDisplay().workArea; 
        this.screenWidth = this.workArea.width;
        this.screenHeight = this.workArea.height;

        if (inputPillWindow && !inputPillWindow.isDestroyed()) {
            this.inputPillBounds = inputPillWindow.getBounds();
        }
        if (athenaWidgetWindow && !athenaWidgetWindow.isDestroyed()) {
            this.athenaWidgetBounds = athenaWidgetWindow.getBounds();
        }
        this.apiKey = apiKey || process.env.GOOGLE_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("GOOGLE_API_KEY is not set in .env or provided to CanvasEngine constructor.");
        }
        this.modelName = modelName;
        this.llm = new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            model: this.modelName,
            temperature: 0.2,
            maxOutputTokens: 2048,
        });

        this._currentMessages = [];
        this._currentCanvasState = { windows: [] };


        const openBrowserTool = tool(
            async (args: z.infer<typeof openWindowSchema>): Promise<string> => {
                logger.info(`[CanvasEngine] Tool 'open_browser_window' called with args: ${JSON.stringify(args)}`);
                try {
                    const windowInfo = await this.coreOpenWindow(args);
                    // coreOpenWindow now potentially adds to this.currentOpenWindows and sets up 'closed' listener
                    // The actual state update to _currentCanvasState.windows and subsequent layout
                    // will be handled in _updateCanvasStateFromToolsNode based on this tool's output.
                    return JSON.stringify(windowInfo);
                } catch (error: any) {
                    logger.error('[CanvasEngine] Error in open_browser_window tool:', error);
                    return JSON.stringify({ error: error.message });
                }
            },
            { name: "open_browser_window", description: "Opens a new browser window with the given URL and optional geometry.", schema: openWindowSchema }
        );

        const closeBrowserTool = tool(
            async (args: z.infer<typeof closeWindowSchema>) => {
                logger.info(`[CanvasEngine] Tool 'close_browser_window' called with args: ${JSON.stringify(args)}`);
                try {
                    const result = this.coreCloseWindow(args);
                    return JSON.stringify(result);
                } catch (error: any) {
                    logger.error('[CanvasEngine] Error in close_browser_window tool:', error);
                    return JSON.stringify({ error: error.message, id: args.id, status: 'error' });
                }
            },
            { name: "close_browser_window", description: "Closes an open browser window given its ID. You can find the ID of open windows in the 'canvas.windows' array in your current state.", schema: closeWindowSchema }
        );

        const resizeMoveBrowserTool = tool(
            async (argsInput: any): Promise<string> => {
                let argsToParse: string | object | null = null;
                logger.info(`[CanvasEngine] Tool 'resize_and_move_window' received raw args: ${typeof argsInput === 'string' ? argsInput : JSON.stringify(argsInput)} (type: ${typeof argsInput})`);

                if (typeof argsInput === 'string') {
                    argsToParse = argsInput;
                } else if (typeof argsInput === 'object' && argsInput !== null) {
                    // Check if it's the nested structure like { "input": "{\"windowId\": ...}" }
                    if (Object.keys(argsInput).length === 1 && typeof argsInput.input === 'string') {
                        logger.info(`[CanvasEngine] resize_and_move_window: Detected nested 'input' string. Will parse its content.`);
                        argsToParse = argsInput.input;
                    } else {
                        // Assume it's a direct object argument
                        argsToParse = argsInput;
                    }
                } else { // argsInput is undefined, or null, or some other primitive
                    const errorDetail = `Tool 'resize_and_move_window' received 'argsInput' of type '${typeof argsInput}' (value: ${JSON.stringify(argsInput)}). When 'argsInput' is undefined, it strongly suggests an upstream failure in parsing the provided arguments against the tool's Zod schema. Please verify the schema definition.`;
                    logger.error(`[CanvasEngine] resize_and_move_window: ${errorDetail}`);
                    return JSON.stringify({
                        error: errorDetail,
                        status: "error"
                    });
                }

                let parsedArgs: z.infer<typeof resizeAndMoveWindowSchema>;
                if (typeof argsToParse === 'string') {
                    try {
                        parsedArgs = JSON.parse(argsToParse);
                    } catch (e: any) {
                        logger.error(`[CanvasEngine] resize_and_move_window: Failed to parse string args: '${argsToParse}'. Error: ${e.message}`);
                        return JSON.stringify({ error: `Invalid JSON arguments string: ${e.message}`, input: argsToParse, status: "error" });
                    }
                } else if (typeof argsToParse === 'object' && argsToParse !== null) {
                    parsedArgs = argsToParse as z.infer<typeof resizeAndMoveWindowSchema>; // Cast, will be validated by Zod
                } else {
                    // This case should ideally be caught by the initial type check
                    logger.error(`[CanvasEngine] resize_and_move_window: argsToParse is neither string nor object after initial processing. Value: ${JSON.stringify(argsToParse)}`);
                    return JSON.stringify({ error: "Internal error processing arguments for resize_and_move_window.", input: argsToParse, status: "error" });
                }

                try {
                    const validatedArgs = resizeAndMoveWindowSchema.parse(parsedArgs);
                    logger.info(`[CanvasEngine] Tool 'resize_and_move_window' proceeding with validated args: ${JSON.stringify(validatedArgs)}`);
                    
                    const windowInfo = await this.coreResizeAndMoveWindow(validatedArgs);
                    return JSON.stringify(windowInfo);
                } catch (error: any) {
                    logger.error('[CanvasEngine] Error in resize_and_move_window tool after parsing/validation:', error);
                    if (error instanceof z.ZodError) {
                         return JSON.stringify({ 
                             error: "Argument validation failed for resize_and_move_window.", 
                             details: error.errors, 
                             receivedArgs: parsedArgs,
                             status: "error" 
                         });
                    }
                    // Ensure windowIdToReport is accessed safely from parsedArgs
                    const windowIdToReport = (parsedArgs && typeof parsedArgs === 'object' && 'windowId' in parsedArgs && typeof parsedArgs.windowId === 'string') ? parsedArgs.windowId : "unknown";
                    return JSON.stringify({ 
                        error: error.message, 
                        id: windowIdToReport, 
                        status: "error" 
                    });
                }
            },
            { name: "resize_and_move_window", description: "Resizes and/or moves a specified browser window using its ID. You can find the ID of open windows in the 'canvas.windows' array in your current state. Provide at least one geometry parameter (x, y, width, height). Returns the updated window information including its new geometry if successful.", schema: resizeAndMoveWindowSchema }
        );

        this.tools = [openBrowserTool, closeBrowserTool, resizeMoveBrowserTool, ...externalTools];

        this.llm = new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            model: this.modelName,
            temperature: 0.2,
            maxOutputTokens: 2048,
        }).bindTools(this.tools);

        this.graph = this._buildGraph();
    }

    private async coreOpenWindow(
        args: z.infer<typeof openWindowSchema>
    ): Promise<CanvasWindowState & { status: 'opened' | 'error'; message?: string }> {
        const { url, x, y, width, height } = args;
        logger.info(`[CanvasEngine coreOpenWindow] Attempting to open window with URL: ${url}`);

        const newWindow = new BrowserWindow({
            x, y, width, height,
            webPreferences: { nodeIntegration: false, contextIsolation: true, webviewTag: true },
            show: true,
            frame: false
        });
        const windowId = `window-${newWindow.id}`;
        this.currentOpenWindows.set(windowId, newWindow);

        await newWindow.loadURL(url);
        const bounds = newWindow.getBounds();
        const title = newWindow.getTitle();

        newWindow.on('closed', () => {
            logger.info(`[CanvasEngine coreOpenWindow] Window ${windowId} closed event received.`);
            this.currentOpenWindows.delete(windowId);
            // Update canvas state internally or emit event if needed for graph state
            this._currentCanvasState.windows = this._currentCanvasState.windows.filter(w => w.id !== windowId);
        });
        
        newWindow.on('resize', () => {
            const newBounds = newWindow.getBounds();
            const winState = this._currentCanvasState.windows.find(w => w.id === windowId);
            if (winState) {
                winState.x = newBounds.x;
                winState.y = newBounds.y;
                winState.width = newBounds.width;
                winState.height = newBounds.height;
            }
        });

        newWindow.on('move', () => {
            const newBounds = newWindow.getBounds();
            const winState = this._currentCanvasState.windows.find(w => w.id === windowId);
            if (winState) {
                winState.x = newBounds.x;
                winState.y = newBounds.y;
            }
        });


        const windowInfo: CanvasWindowState = {
            id: windowId, url,
            x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
            title: title
        };
        logger.info(`[CanvasEngine coreOpenWindow] Window ${windowId} opened successfully: ${JSON.stringify(windowInfo)}`);
        return { ...windowInfo, status: 'opened' };
    }

    private coreCloseWindow(
        args: z.infer<typeof closeWindowSchema>
    ): { id: string; status: 'closed' | 'not_found' | 'error'; message?: string } {
        const { id } = args;
        logger.info(`[CanvasEngine coreCloseWindow] Attempting to close window ${id}`);
        const windowInstance = this.currentOpenWindows.get(id);
        if (windowInstance) {
            try {
                windowInstance.close(); // This will trigger the 'closed' event handled in coreOpenWindow
                this.currentOpenWindows.delete(id); // Ensure it's removed from map immediately
                logger.info(`[CanvasEngine coreCloseWindow] Window ${id} closed successfully.`);
                return { id, status: 'closed' };
            } catch (error: any) {
                logger.error(`[CanvasEngine coreCloseWindow] Error closing window ${id}:`, error);
                return { id, status: 'error', message: error.message };
            }
        } else {
            logger.warn(`[CanvasEngine coreCloseWindow] Window ${id} not found.`);
            return { id, status: 'not_found', message: 'Window ID not found in currently open windows.' };
        }
    }
    
    private coreResizeAndMoveWindow(
        args: z.infer<typeof resizeAndMoveWindowSchema>
    ): { id: string; status: 'updated' | 'not_found' | 'no_change_params' | 'error'; x?: number; y?: number; width?: number; height?: number; message?: string } {
        const { windowId, x, y, width, height } = args;
        logger.info(`[CanvasEngine coreResizeAndMoveWindow] Attempting to resize/move window ${windowId} with args: ${JSON.stringify(args)}`);

        if (x === undefined && y === undefined && width === undefined && height === undefined) {
            logger.warn(`[CanvasEngine coreResizeAndMoveWindow] No geometry parameters provided for window ${windowId}.`);
            return { id: windowId, status: 'no_change_params', message: 'No geometry parameters (x, y, width, height) were provided.' };
        }

        const windowInstance = this.currentOpenWindows.get(windowId);
        if (!windowInstance) {
            logger.warn(`[CanvasEngine coreResizeAndMoveWindow] Window ${windowId} not found.`);
            return { id: windowId, status: 'not_found', message: 'Window ID not found.' };
        }

        try {
            const currentBounds = windowInstance.getBounds();
            const newBounds = { ...currentBounds }; // Start with current bounds

            if (x !== undefined) newBounds.x = x;
            if (y !== undefined) newBounds.y = y;
            if (width !== undefined) newBounds.width = Math.max(100, width); // Min width
            if (height !== undefined) newBounds.height = Math.max(100, height); // Min height

            // Ensure the window remains somewhat visible on the primary display
            const primaryDisplay = screen.getPrimaryDisplay();
            const { workArea } = primaryDisplay;
            const minVisibleOffset = 50; // Minimum pixels to keep visible

            newBounds.x = Math.max(workArea.x - newBounds.width + minVisibleOffset, Math.min(newBounds.x, workArea.x + workArea.width - minVisibleOffset));
            newBounds.y = Math.max(workArea.y - newBounds.height + minVisibleOffset, Math.min(newBounds.y, workArea.y + workArea.height - minVisibleOffset));
            
            // Clamp width/height to be within workArea if they exceed it (though less common for setBounds)
            newBounds.width = Math.min(newBounds.width, workArea.width);
            newBounds.height = Math.min(newBounds.height, workArea.height);


            windowInstance.setBounds(newBounds);
            const finalBounds = windowInstance.getBounds(); // Get actual bounds after Electron applies them

            logger.info(`[CanvasEngine coreResizeAndMoveWindow] Window ${windowId} resized/moved successfully. New bounds: ${JSON.stringify(finalBounds)}`);
            return { 
                id: windowId, 
                status: 'updated', 
                x: finalBounds.x, 
                y: finalBounds.y, 
                width: finalBounds.width, 
                height: finalBounds.height 
            };
        } catch (error: any) {
            logger.error(`[CanvasEngine coreResizeAndMoveWindow] Error resizing/moving window ${windowId}:`, error);
            return { id: windowId, status: 'error', message: error.message };
        }
    }

    private _defineAgentState(): {
        messages: { value: (x: BaseMessage[] | undefined, y: BaseMessage[]) => BaseMessage[]; default: () => BaseMessage[] };
        canvas: { value: (x: CanvasState | undefined, y: CanvasState) => CanvasState; default: () => CanvasState };
    } {
        return {
            messages: {
                value: (x: BaseMessage[] | undefined, y: BaseMessage[]) => (x || []).concat(y),
                default: () => [] as BaseMessage[],
            },
            canvas: {
                value: (_prev: CanvasState | undefined, next: CanvasState) => next, // Always take the new state
                default: () => ({ windows: [] }) as CanvasState,
            }
        };
    }

    private async _callAgentNode(state: AgentState): Promise<{ messages: BaseMessage[] }> {
        const fullMessageHistory = [...this._currentMessages, ...state.messages];
        const currentCanvasStateForPrompt = this._currentCanvasState; // Use the engine's persisted state for the prompt

        let systemMessageContent = `You are a helpful AI assistant for the LaserFocus application.
Your primary display has a resolution of ${this.screenWidth}x${this.screenHeight}.
The InputPill UI element is located at the bottom center of the screen (around y=${this.screenHeight - 100} for reference).
The AthenaWidget UI element is located at the top right of the screen (around x=${this.screenWidth - 400}, y=20 for reference).

When opening new browser windows:
1. New windows will be FRAMELESS (no title bar or borders).
2. Position new windows thoughtfully in the available negative space.
3. Prefer the middle to top-right area of the screen. Specifically, try to place new windows in the negative space between the InputPill and the AthenaWidget.
4. Avoid overlapping existing UI elements (InputPill, AthenaWidget) or other already open AI-managed windows.
5. Use the x, y, width, and height parameters of the 'open_browser_window' tool to achieve this. If not specified, a default size and position will be used, which might not be optimal.

You can interact with the user's desktop by managing browser windows.
Your goal is to fulfill the user's requests by opening, closing, resizing, and moving browser windows.
Always acknowledge the user's request and explain your plan before taking actions.
If multiple steps are needed, explain them.
If you encounter an error, inform the user and suggest a possible cause or next step.

Current Canvas State:
The canvas currently has ${currentCanvasStateForPrompt.windows.length} window(s) open.
Windows details (id, url, x, y, width, height, title):
${currentCanvasStateForPrompt.windows.map(w => `  - ID: ${w.id}, URL: ${w.url}, X: ${w.x}, Y: ${w.y}, W: ${w.width}, H: ${w.height}, Title: ${w.title}`).join('\n') || '  No windows currently open.'}

Tool: 'open_browser_window'
  Description: Opens a new, FRAMELESS browser window with the given URL and optional title, position, and size.
  Parameters:
url (string, required): The URL to open.
title (string, optional): An optional title for the new window.
x (number, optional): Desired x coordinate for the window's top-left corner.
y (number, optional): Desired y coordinate for the window's top-left corner.
width (number, optional): Desired width for the window.
height (number, optional): Desired height for the window.
  Example: {"tool_calls": [{"name": "open_browser_window", "args": {"url": "https://www.example.com", "title": "Example Page", "x": ${Math.floor(this.screenWidth / 2)}, "y": 50, "width": ${Math.floor(this.screenWidth / 3)}, "height": ${Math.floor(this.screenHeight / 2)}}}]}

Tool: 'close_browser_window'
  Description: Closes an open browser window given its ID. You can find the ID of open windows in the 'canvas.windows' array in your current state.
  Parameters:
id (string, required): The ID of the window to close (e.g., "window-123").
  Example: {"tool_calls": [{"name": "close_browser_window", "args": {"id": "window-123"}}]}

Tool: 'resize_and_move_window'
  Description: Resizes and/or moves a specified browser window using its ID. You can find the ID of open windows in the 'canvas.windows' array in your current state. Provide at least one geometry parameter (x, y, width, height). Returns the updated window information including its new geometry if successful.
  Parameters:
windowId (string, required): The ID of the window to modify (e.g., "window-123").
x (number, optional): The new x coordinate for the window's top-left corner.
y (number, optional): The new y coordinate for the window's top-left corner.
width (number, optional): The new width for the window.
height (number, optional): The new height for the window.
  Example (move and resize): {"tool_calls": [{"name": "resize_and_move_window", "args": {"windowId": "window-123", "x": 100, "y": 150, "width": 1024, "height": 768}}]}

Important: When using 'resize_and_move_window', you MUST provide the 'windowId' and at least one of 'x', 'y', 'width', or 'height'.
The primary display's work area starts at coordinates (x=0, y=0 for top-left) and is ${this.screenWidth}x${this.screenHeight}. Plan your window placements accordingly.

Think step-by-step. If a tool call fails, the error message will be provided. Analyze it and try to correct your action or inform the user.
Always provide the 'tool_calls' array when you intend to use a tool.
If you don't need to use a tool, respond directly to the user.
CRITICAL: If you decide to use a tool, your *entire* response MUST be *only* the JSON for the 'tool_calls' array, and nothing else. Do NOT include any conversational text or explanation before or after the JSON if you are calling a tool.
`;

        // Dynamically add current window state and screen info to the system prompt
        const currentWindowsForPrompt = this._currentCanvasState.windows.map(w => ({
            id: w.id,
            title: w.title,
            // url: w.url, // Optional: URL can be long, consider omitting for prompt brevity
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
        }));
        const windowStateJson = JSON.stringify(currentWindowsForPrompt, null, 2);

        let inputPillInfo = `A UI component typically at the bottom-center of the screen. Avoid placing windows over this area.`;
        if (this.inputPillBounds) {
            inputPillInfo = `InputPill component is present near the bottom (e.g., around y=${this.inputPillBounds.y}, height=${this.inputPillBounds.height}px). Ensure new/moved windows are placed above this zone.`;
        }

        let athenaWidgetInfo = `A UI component typically at the top-right of the screen. Avoid placing windows over this area.`;
        if (this.athenaWidgetBounds) {
            athenaWidgetInfo = `AthenaWidget component is present near the top-right (e.g., around x=${this.athenaWidgetBounds.x}, y=${this.athenaWidgetBounds.y}, width=${this.athenaWidgetBounds.width}px, height=${this.athenaWidgetBounds.height}px). Ensure new/moved windows respect this zone.`;
        }

        // Constants for layout calculations within the prompt
        const screenEdgePadding = 10; // Padding from screen edges
        const windowGap = 10;         // Gap between tiled windows
        const menuBarEstimateHeight = 40; // Estimated height for system menu bar / top UI elements
        const effectiveTopY = screenEdgePadding + menuBarEstimateHeight; // Final Y for top of windows

        // Pre-calculate layout values to provide directly to the agent
        const maxBottomYBoundary = this.inputPillBounds 
            ? this.inputPillBounds.y - screenEdgePadding 
            : this.screenHeight - 50 - screenEdgePadding; // 50 is a fallback for InputPill height

        const calculatedHeight = maxBottomYBoundary - effectiveTopY;

        const calculatedWidth_NoAthena = this.screenWidth - screenEdgePadding - screenEdgePadding;
        
        let calculatedWidth_WithAthena = calculatedWidth_NoAthena; // Default to full width if Athena isn't a constraint
        if (this.athenaWidgetBounds) {
            const widthToAthena = this.athenaWidgetBounds.x - screenEdgePadding - windowGap - screenEdgePadding;
            calculatedWidth_WithAthena = Math.min(widthToAthena, calculatedWidth_NoAthena);
        }
        const minSensibleWidth = 300; // Minimum sensible width for a window
        const finalCalculatedWidth_WithAthena = Math.max(calculatedWidth_WithAthena, minSensibleWidth);
        const finalCalculatedWidth_NoAthena = Math.max(calculatedWidth_NoAthena, minSensibleWidth);
        const finalCalculatedHeight = Math.max(calculatedHeight, 200); // Minimum sensible height
        const athenaWidgetXForPrompt = this.athenaWidgetBounds ? this.athenaWidgetBounds.x.toString() : 'null';
        const screenWidthForPrompt = this.screenWidth;
        const minSensibleWidthForPrompt = minSensibleWidth; // Assumes minSensibleWidth is defined earlier (it is)

        const first_window_target_width = (this.athenaWidgetBounds && athenaWidgetXForPrompt !== 'null')
            ? finalCalculatedWidth_WithAthena
            : finalCalculatedWidth_NoAthena;

        const maxXForTiling = this.athenaWidgetBounds && parseFloat(athenaWidgetXForPrompt) > 0 
            ? (this.athenaWidgetBounds.x - windowGap) 
            : (this.screenWidth - screenEdgePadding);

        const layoutStrategy = `
            # Layout Strategy Guidelines:
            
            Your primary goal is to manage windows effectively. Use the 'open_browser_window' or 'resize_and_move_window' tools.
            **You MUST use the PRE-CALCULATED values and explicit LOGIC provided below.** Do NOT perform your own calculations for primary dimensions unless specified by the logic.
            When providing arguments to tools, the \`args\` parameter MUST be a valid JSON object that conforms to the tool's schema. DO NOT pass a stringified JSON as the value for \`args\`.
            
            ## Key Values (USE THESE PRECISELY):
            - **Default X for new windows (left edge):** \`${screenEdgePadding}\`
            - **Default Y for new windows (top edge):** \`${effectiveTopY}\`
            - **Default Maximized Height for all windows:** \`${finalCalculatedHeight}\`
            - **Screen Edge Padding (all sides):** \`${screenEdgePadding}\`px
            - **Gap Between Tiled Windows:** \`${windowGap}\`px
            - **Max Bottom Y Boundary (bottom edge of usable space, windows should not go below this Y):** \`${maxBottomYBoundary}\`
            - **Calculated Usable Width for a SINGLE Full Window (respecting Athena):** \`${first_window_target_width}\`px. **USE THIS EXACT WIDTH FOR THE FIRST WINDOW.**
            - **Calculated Rightmost X-Coordinate for Tiling Area (this is where the tiling area ENDS):** \`${maxXForTiling}\`px. Let this be \`MAX_X_FOR_TILING\`.
            - **Minimum Sensible Width per window (guideline):** \`${minSensibleWidthForPrompt}\`px
            
            1.  **ALWAYS Respect UI Zones & Screen Edges:**
                -   Ensure windows do NOT overlap the InputPill zone: ${inputPillInfo}
                -   Ensure windows do NOT overlap the AthenaWidget zone: ${athenaWidgetInfo}
                -   All windows MUST adhere to the \`${screenEdgePadding}\` on all sides, use \`${effectiveTopY}\` for the top Y-coordinate, and not extend below \`${maxBottomYBoundary}\` for the bottom Y-coordinate.
            
            2.  **Opening/Positioning the FIRST Main Application Window:**
                -   Call \`open_browser_window\`.
                -   The \`width\` for this first window MUST be exactly the \`${first_window_target_width}\` value provided in the "Key Values" section. Do not deviate.
                -   The \`args\` parameter for the tool call MUST be a valid JSON object (NOT a string) structured as follows, substituting only "the_url_to_open":
                    \`\`\`json
                    {
                      "url": "the_url_to_open",
                      "x": ${screenEdgePadding},
                      "y": ${effectiveTopY},
                      "width": ${first_window_target_width},
                      "height": ${finalCalculatedHeight}
                    }
                    \`\`\`
            
            3.  **Opening/Positioning SUBSEQUENT Main Application Windows (when existing windows are already open):**
                Your goal is to tile windows horizontally, sharing the available space equally, and **resizing existing windows as needed.**
                You will make MULTIPLE tool calls: one \`resize_and_move_window\` for EACH existing window, and then one \`open_browser_window\` for the new window. The \`args\` for each tool call MUST be a valid JSON object.
            
                **Steps to follow meticulously:**
                A. **Identify Windows & Count:** Get the list of currently open main windows from "Current Canvas & Screen Information". Let \`num_existing_windows\` be this count. The new total number of windows to be tiled horizontally will be \`N = num_existing_windows + 1\`.
            
                B. **Calculate Width Per Window (\`width_per_window\`):**
                    - The available horizontal space for tiling starts at \`x_start_tiling = ${screenEdgePadding}\` and ends at \`x_end_tiling = ${maxXForTiling}\`.
                    - Therefore, \`total_available_width_for_tiling = x_end_tiling - x_start_tiling\`.
                    - \`total_gaps_width = ${windowGap} * (N - 1)\`.
                    - \`width_per_window = Math.floor((total_available_width_for_tiling - total_gaps_width) / N)\`. (Use Math.floor for integer pixels)
                    - **CRITICAL CHECK:** If \`width_per_window < ${minSensibleWidthForPrompt}\`, windows will be too small. **DO NOT proceed with tiling.** Respond to the user that you cannot open the new window without making existing windows too narrow and ask for guidance.
            
                C. **Resize Existing Windows and Position Them (Iterate from left to right):**
                    - Let \`current_x_tracker = ${screenEdgePadding}\`.
                    - For each existing window \`W_existing_i\` (ordered from left to right as they appear in the current state):
                        - The \`args\` for \`resize_and_move_window\` MUST be a valid JSON object (NOT a string) structured as follows (use actual window ID, and EXACTLY the calculated \`width_per_window\` and \`current_x_tracker\`):
                          \`\`\`json
                          {
                            "windowId": "ID_of_W_existing_i_from_canvas_state",
                            "x": /* current_x_tracker_value */,
                            "y": ${effectiveTopY},
                            "width": /* width_per_window_value */,
                            "height": ${finalCalculatedHeight}
                          }
                          \`\`\`
                        - Update \`current_x_tracker = current_x_tracker + width_per_window + ${windowGap}\`.
                    - **You MUST issue a separate \`resize_and_move_window\` tool call (with its own JSON \`args\`) for EACH existing window.**
            
                D. **Open the New Window:**
                    - After planning the resize calls for all existing windows:
                    - The \`args\` for \`open_browser_window\` for the new window \`W_new\` MUST be a valid JSON object (NOT a string) structured as follows (ensure you include the \`url\` and use the final \`current_x_tracker\` for x, and EXACTLY the calculated \`width_per_window\`):
                      \`\`\`json
                      {
                        "url": "the_url_to_open_for_new_window",
                        "x": /* final_current_x_tracker_value_for_new_window_x */,
                        "y": ${effectiveTopY},
                        "width": /* width_per_window_value */,
                        "height": ${finalCalculatedHeight}
                      }
                      \`\`\`
            
                **Example for 1 existing window (W0) becoming 2 windows (W0, W_new):**
                - \`num_existing_windows = 1\`, so \`N = 2\`.
                - Calculate \`width_per_window\` using \`N=2\` and \`MAX_X_FOR_TILING\`.
                - Tool call 1 (resize W0): \`resize_and_move_window\` with \`args: {"windowId": "ID_of_W0", "x": ${screenEdgePadding}, "y": ${effectiveTopY}, "width": /* width_per_window */, "height": ${finalCalculatedHeight}}\`
                - Tool call 2 (open W_new): \`open_browser_window\` with \`args: {"url": "new_url", "x": ${screenEdgePadding} + /* width_per_window */ + ${windowGap}, "y": ${effectiveTopY}, "width": /* width_per_window */, "height": ${finalCalculatedHeight}}\`
            
                Current Canvas State:
            The canvas currently has ${currentCanvasStateForPrompt.windows.length} window(s) open.
            Windows details (id, url, x, y, width, height, title):
            ${currentCanvasStateForPrompt.windows.map(w => `  - ID: ${w.id}, URL: ${w.url}, X: ${w.x}, Y: ${w.y}, W: ${w.width}, H: ${w.height}, Title: ${w.title}`).join('\n') || '  No windows currently open.'}
            
            Think step-by-step. If a tool call fails, the error message will be provided. Analyze it and try to correct your action or inform the user.
            Always provide the 'tool_calls' array when you intend to use a tool.
            If you don't need to use a tool, respond directly to the user.
            `;

        const dynamicSystemInfo = `\n\n# Current Canvas & Screen Information:\n\n## Open Windows:\n${windowStateJson}\n\n## Screen Work Area:\nWidth: ${this.screenWidth}px\nHeight: ${this.screenHeight}px\n(Coordinates: top-left is 0,0)\n\n## Key UI Component Zones (Avoid Overlap Details):\n- InputPill: ${inputPillInfo}\n- AthenaWidget: ${athenaWidgetInfo}\n\n${layoutStrategy}\nYour primary goal is to manage windows effectively based on user requests. When opening new windows or adjusting existing ones, use the tool parameters (x, y, width, height) thoughtfully. Consider this live information to achieve a clean, organized layout (e.g., tiling for multiple windows, sensible centering for single windows) that respects these UI zones and screen boundaries. The layout is your responsibility.`;
        
        // Assuming 'systemMessageContent' holds the static part of the prompt defined earlier
        const finalSystemMessageContent = systemMessageContent + dynamicSystemInfo;

        const messagesForLlm: BaseMessage[] = [new SystemMessage({ content: finalSystemMessageContent }), ...fullMessageHistory]; // Use SystemMessage and the augmented content
        
        const lastUserMessageContent = messagesForLlm[messagesForLlm.length - 1].content;
        logger.info(`[CanvasEngine _callAgentNode] Calling LLM. Message history length: ${messagesForLlm.length}. Last message: "${typeof lastUserMessageContent === 'string' ? lastUserMessageContent : JSON.stringify(lastUserMessageContent)}"`);
        logger.info(`[CanvasEngine _callAgentNode] Full messagesForLlm being sent to LLM: ${JSON.stringify(messagesForLlm, null, 2)}`);
        const response = await this.llm.invoke(messagesForLlm) as AIMessage; // Assert response as AIMessage
        logger.info(`[CanvasEngine _callAgentNode] Full raw response from LLM: ${JSON.stringify(response, null, 2)}`);
        const responseContent = response.content;
        logger.info(`[CanvasEngine _callAgentNode] LLM response received: "${typeof responseContent === 'string' ? responseContent : JSON.stringify(responseContent)}" Tool calls: ${JSON.stringify(response.tool_calls)}`);
        return { messages: [response] };
    }

    private static _shouldContinueNode(state: AgentState): "tools" | typeof END {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            logger.info("[CanvasEngine _shouldContinueNode] Agent decided to use tools. Proceeding to 'tools' node.");
            return "tools";
        }
        logger.info("[CanvasEngine _shouldContinueNode] Agent decided not to use tools. Proceeding to END.");
        return END;
    }

    private _updateCanvasStateFromToolsNode(state: AgentState): Partial<AgentState> {
        let invokingAIMessage: AIMessage | undefined;
        // Iterate backwards to find the most recent AIMessage with tool_calls
        for (let i = state.messages.length - 1; i >= 0; i--) {
            const msg = state.messages[i];
            if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
                invokingAIMessage = msg;
                break;
            }
        }

        if (!invokingAIMessage) {
            logger.warn("[CanvasEngine _updateCanvasStateFromToolsNode] No AIMessage with tool calls found to process. Canvas state remains unchanged.");
            return { canvas: this._currentCanvasState }; // Return current state if no invoking AIMessage found
        }

        let updatedCanvasState = { ...this._currentCanvasState, windows: [...this._currentCanvasState.windows] };

        for (const toolCall of invokingAIMessage.tool_calls!) {
            const toolName = toolCall.name;
            
            const relevantToolMessage = state.messages.find(
                (msg): msg is ToolMessage => {
                    return msg.constructor.name === "ToolMessage" && 
                           typeof (msg as ToolMessage).tool_call_id === 'string' && 
                           (msg as ToolMessage).tool_call_id === toolCall.id;
                }
            );

            if (!relevantToolMessage) {
                logger.error(`[CanvasEngine _updateCanvasStateFromToolsNode] No ToolMessage found for tool_call_id: ${toolCall.id} for tool ${toolName}. Skipping this tool call.`);
                continue;
            }

            let toolOutput: any;
            const toolContent = relevantToolMessage.content;
            if (typeof toolContent === 'string') {
                try {
                    toolOutput = JSON.parse(toolContent);
                } catch (e: any) {
                    logger.error(`[CanvasEngine _updateCanvasStateFromToolsNode] Error parsing JSON from ToolMessage content for tool_call_id: ${toolCall.id}. Content: ${toolContent}. Error: ${e.message}. Skipping this tool call.`);
                    continue;
                }
            } else {
                // If toolContent is not a string, it might already be structured data if the tool returns it directly.
                // However, our current tools (open, close, resize) are expected to return JSON strings.
                // For robustness, we could handle pre-parsed objects if necessary, but for now, we'll log and skip.
                logger.warn(`[CanvasEngine _updateCanvasStateFromToolsNode] ToolMessage content for tool_call_id: ${toolCall.id} is not a string. Type: ${typeof toolContent}. Content: ${JSON.stringify(toolContent)}. Assuming it's not processable by this node if not a JSON string. Skipping this tool call.`);
                toolOutput = toolContent; // Attempt to use as is, or handle based on expected non-string outputs
                // For current tools, this path likely means an issue, so we might prefer to 'continue' as with parse errors.
                // Let's assume for now that if it's not a string, it's an error for current tools.
                 logger.error(`[CanvasEngine _updateCanvasStateFromToolsNode] ToolMessage content for tool_call_id: ${toolCall.id} is not a string. Content: ${JSON.stringify(toolContent)}. Skipping this tool call.`);
                continue;
            }

            logger.info(`[CanvasEngine _updateCanvasStateFromToolsNode] Processing tool result for '${toolName}', call ID '${toolCall.id}'. Parsed Output: ${JSON.stringify(toolOutput)}`);

            if (toolName === "open_browser_window") {
                if (toolOutput.status === 'opened' && toolOutput.id) {
                    const existingWindow = updatedCanvasState.windows.find(w => w.id === toolOutput.id);
                    if (!existingWindow) {
                        updatedCanvasState.windows.push({
                            id: toolOutput.id,
                            url: toolOutput.url,
                            x: toolOutput.x,
                            y: toolOutput.y,
                            width: toolOutput.width,
                            height: toolOutput.height,
                            title: toolOutput.title
                        });
                    } else {
                        existingWindow.url = toolOutput.url;
                        existingWindow.x = toolOutput.x;
                        existingWindow.y = toolOutput.y;
                        existingWindow.width = toolOutput.width;
                        existingWindow.height = toolOutput.height;
                        existingWindow.title = toolOutput.title;
                    }
                }
            } else if (toolName === "close_browser_window") {
                if (toolOutput.status === 'closed' && toolOutput.id) {
                    updatedCanvasState.windows = updatedCanvasState.windows.filter(w => w.id !== toolOutput.id);
                }
            } else if (toolName === "resize_and_move_window") {
                if (toolOutput.status === 'updated' && toolOutput.id) {
                    const windowToUpdate = updatedCanvasState.windows.find(w => w.id === toolOutput.id);
                    if (windowToUpdate) {
                        if (toolOutput.x !== undefined) windowToUpdate.x = toolOutput.x;
                        if (toolOutput.y !== undefined) windowToUpdate.y = toolOutput.y;
                        if (toolOutput.width !== undefined) windowToUpdate.width = toolOutput.width;
                        if (toolOutput.height !== undefined) windowToUpdate.height = toolOutput.height;
                        if (toolOutput.title !== undefined) windowToUpdate.title = toolOutput.title; // Assuming title can be updated
                    } else {
                        logger.warn(`[CanvasEngine _updateCanvasStateFromToolsNode] resize_and_move_window reported update for non-existent window ID ${toolOutput.id} in canvas state.`);
                    }
                }
            }
        }

        this._currentCanvasState = { ...updatedCanvasState }; // Ensure a new object for the state
        logger.info(`[CanvasEngine _updateCanvasStateFromToolsNode] Canvas state updated. Windows count: ${this._currentCanvasState.windows.length}`);
        // After all tool messages are processed and _currentCanvasState is updated,
        // perform the smart layout.
        // if (layoutNeeded) this._performSmartLayout(); // Removed automatic call to _performSmartLayout
        logger.info(`[CanvasEngine _updateCanvasStateFromToolsNode] Canvas state updated. Windows count: ${this._currentCanvasState.windows.length}`);
        return { canvas: this._currentCanvasState }; // Return only the modified part of the state
    }


    private _buildGraph(): Runnable<AgentState, AgentState> {
        // The NodeNames type alias is good for documenting intent,
        // though its effectiveness is reduced by 'as any' casts.
        type NodeNames = "agent" | "tools" | "_update_canvas_state";
    
        const workflow = new StateGraph<AgentState, Partial<AgentState>, NodeNames>({
            channels: this._defineAgentState()
        });
    
        const toolNode = new ToolNode<AgentState>(this.tools);
    
        // Cast node functions/instances to 'any' when adding them
        workflow.addNode("agent" as any, this._callAgentNode.bind(this) as any);
        workflow.addNode("tools" as any, toolNode as any);
        workflow.addNode("_update_canvas_state" as any, this._updateCanvasStateFromToolsNode.bind(this) as any);
    
        // Set the entry point. Assuming START is correctly imported and available.
        // If you use setEntryPoint, it would be: workflow.setEntryPoint("agent" as any);
        workflow.addEdge(START, "agent" as any);
    
        // Cast the source node name, condition function, and target node names to 'any'
        workflow.addConditionalEdges(
            "agent" as any,
            CanvasEngine._shouldContinueNode.bind(this) as any, // Ensure .bind(this) if _shouldContinueNode is a class method
            {
                tools: "tools" as any,
                [END]: END as any // Assuming END is correctly imported and available
            }
        );
    
        // Cast node names to 'any' in other edges
        workflow.addEdge("tools" as any, "_update_canvas_state" as any);
        workflow.addEdge("_update_canvas_state" as any, "agent" as any); // Loop back to agent
    
        // Cast the compiled graph to 'any'
        return workflow.compile() as any;
    }

    async invoke(userInput: string, config: { recursionLimit?: number } = { recursionLimit: 25 }): Promise<AgentState> {
        logger.info(`[CanvasEngine invoke] Received input: "${userInput}"`);
        logger.info(`[CanvasEngine invoke] State BEFORE this invocation: Persisted messages count: ${this._currentMessages.length}, Persisted canvas windows count: ${this._currentCanvasState.windows.length}`);

        const initialStateForGraph: AgentState = { 
            messages: [new HumanMessage(userInput)],
            // Pass a copy of the current canvas state to the graph for this invocation
            canvas: { windows: JSON.parse(JSON.stringify(this._currentCanvasState.windows)) } 
        };

        logger.info(`[CanvasEngine invoke] Initializing graph run. Graph messages: 1, Graph canvas windows: ${initialStateForGraph.canvas.windows.length}`);
        
        const finalStateFromGraph = await this.graph.invoke(initialStateForGraph, config);

        // Persist messages from this invocation
        // Filter out the initial system prompt message if it was part of the graph's message flow directly
        const messagesToPersist = finalStateFromGraph.messages.filter(
            msg => !(msg instanceof HumanMessage && msg.name === "system_prompt_for_laserfocus_agent")
        );
        this._currentMessages.push(...messagesToPersist);

        logger.info(`[CanvasEngine invoke] State AFTER this invocation: Persisted messages count: ${this._currentMessages.length}, Persisted canvas windows count: ${this._currentCanvasState.windows.length}`);
        logger.info(`[CanvasEngine invoke] Final graph state messages: ${JSON.stringify(finalStateFromGraph.messages.map(m=>({type: m.constructor.name, content: m.content, tool_calls: (m as any).tool_calls})))}`);

        return finalStateFromGraph;
    }
}