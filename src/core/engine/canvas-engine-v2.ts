import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { StructuredTool, tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIChatCallOptions } from "@langchain/google-genai";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { BrowserWindow, Rectangle, screen } from 'electron';
import { z } from 'zod';
import logger from '../../utils/logger';
import { layoutStrategyPrompt } from './prompts/layout-strategy';
import { systemBasePrompt } from './prompts/system-base';
import { closeWindowSchema, openWindowSchema, resizeAndMoveWindowSchema } from './tools/canvas-tool-schemas';

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

export interface UIComponentBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
}

export interface LayoutConfig {
    screenEdgePadding: number;
    windowGap: number;
    menuBarHeight: number;
    minWindowWidth: number;
}

/**
 * Modern Canvas Engine for LaserFocus
 * Manages browser windows using LangGraph with proper tool calling
 */
export class CanvasEngineV2 {
    private readonly apiKey: string;
    private readonly modelName: string;
    private readonly workArea: Rectangle;
    private readonly llm: Runnable<BaseLanguageModelInput, AIMessageChunk, GoogleGenerativeAIChatCallOptions>;
    private readonly tools: StructuredTool[];
    private readonly graph: any;
    
    // State management
    private messages: BaseMessage[] = [];
    private canvasState: CanvasState = { windows: [] };
    private openWindows: Map<string, BrowserWindow> = new Map();
    private uiComponents: UIComponentBounds[] = [];
    
    // Abort signal management for memory leak prevention
    private currentAbortController: AbortController | null = null;
    
    // Layout configuration
    private readonly layoutConfig: LayoutConfig = {
        screenEdgePadding: 10,
        windowGap: 10,
        menuBarHeight: 40,
        minWindowWidth: 300
    };

    constructor(
        apiKey: string | undefined,
        modelName: string,
        externalTools: StructuredTool[] = [],
        inputPillWindow?: BrowserWindow,
        athenaWidgetWindow?: BrowserWindow
    ) {
        this.workArea = screen.getPrimaryDisplay().workArea;
        this.apiKey = apiKey || process.env.GOOGLE_API_KEY || "";
        
        if (!this.apiKey) {
            throw new Error("GOOGLE_API_KEY is required");
        }
        
        this.modelName = modelName;
        this.setupUIComponents(inputPillWindow, athenaWidgetWindow);
        this.tools = this.createTools(externalTools);
        this.llm = this.createLLM();
        this.graph = this.buildGraph();
    }

    /**
     * Set up UI component boundaries for layout calculations
     */
    private setupUIComponents(inputPillWindow?: BrowserWindow, athenaWidgetWindow?: BrowserWindow): void {
        if (inputPillWindow && !inputPillWindow.isDestroyed()) {
            const bounds = inputPillWindow.getBounds();
            this.uiComponents.push({
                ...bounds,
                name: 'InputPill'
            });
        }

        if (athenaWidgetWindow && !athenaWidgetWindow.isDestroyed()) {
            const bounds = athenaWidgetWindow.getBounds();
            this.uiComponents.push({
                ...bounds,
                name: 'AthenaWidget'  
            });
        }
    }

    /**
     * Create tool instances with proper binding
     */
    private createTools(externalTools: StructuredTool[]): StructuredTool[] {
        const openWindowTool = tool(
            async (args: z.infer<typeof openWindowSchema>) => {
                logger.info(`[CanvasEngine] Opening window: ${JSON.stringify(args)}`);
                return await this.openWindow(args);
            },
            {
                name: "open_browser_window",
                description: "Opens a new browser window with the specified URL and geometry",
                schema: openWindowSchema
            }
        );

        const closeWindowTool = tool(
            async (args: z.infer<typeof closeWindowSchema>) => {
                logger.info(`[CanvasEngine] Closing window: ${JSON.stringify(args)}`);
                return this.closeWindow(args);
            },
            {
                name: "close_browser_window", 
                description: "Closes an existing browser window by ID",
                schema: closeWindowSchema
            }
        );

        const resizeMoveTool = tool(
            async (args: z.infer<typeof resizeAndMoveWindowSchema>) => {
                logger.info(`[CanvasEngine] Resizing/moving window: ${JSON.stringify(args)}`);
                logger.info(`[CanvasEngine] Resize tool arguments received:`, args);
                logger.info(`[CanvasEngine] Type of args: ${typeof args}`);
                logger.info(`[CanvasEngine] Args keys: ${args ? Object.keys(args) : 'undefined/null'}`);
                
                if (!args) {
                    logger.error(`[CanvasEngine] Resize tool received null/undefined arguments`);
                    return { id: 'unknown', status: 'error', message: 'No arguments provided' };
                }
                
                return this.resizeAndMoveWindow(args);
            },
            {
                name: "resize_and_move_window",
                description: "Resizes and/or moves an existing browser window by ID. Use separate parameters: windowId, x, y, width, height",
                schema: resizeAndMoveWindowSchema
            }
        );

        logger.info(`[CanvasEngine] Tools created: ${[openWindowTool, closeWindowTool, resizeMoveTool, ...externalTools].map(t => t.name)}`);
        return [openWindowTool, closeWindowTool, resizeMoveTool, ...externalTools];
    }

    /**
     * Create and configure the LLM with tool binding
     */
    private createLLM(): Runnable<BaseLanguageModelInput, AIMessageChunk, GoogleGenerativeAIChatCallOptions> {
        return new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            model: this.modelName,
            temperature: 0.2,
            maxOutputTokens: 2048,
        }).bindTools(this.tools);
    }

    /**
     * Build the LangGraph workflow
     */
    private buildGraph() {
        // Custom tool execution instead of ToolNode to handle Google AI format properly
        const executeTools = async (state: typeof MessagesAnnotation.State) => {
            const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            const toolResults: any[] = [];
            
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                logger.info(`[CanvasEngine] Executing ${lastMessage.tool_calls.length} tool calls`);
                
                for (const toolCall of lastMessage.tool_calls) {
                    logger.info(`[CanvasEngine] Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolCall.args)}`);
                    
                    try {
                        let result;
                        
                        // Call our tool functions directly
                        switch (toolCall.name) {
                            case 'open_browser_window':
                                const openArgs = openWindowSchema.parse(toolCall.args);
                                result = await this.openWindow(openArgs);
                                break;
                            case 'close_browser_window':
                                const closeArgs = closeWindowSchema.parse(toolCall.args);
                                result = this.closeWindow(closeArgs);
                                break;
                            case 'resize_and_move_window':
                                const resizeArgs = resizeAndMoveWindowSchema.parse(toolCall.args);
                                result = this.resizeAndMoveWindow(resizeArgs);
                                break;
                            default:
                                // For external tools, try using tool.invoke
                                const tool = this.tools.find(t => t.name === toolCall.name);
                                if (tool) {
                                    result = await tool.invoke(toolCall.args);
                                } else {
                                    logger.error(`[CanvasEngine] Tool not found: ${toolCall.name}`);
                                    result = { error: `Tool not found: ${toolCall.name}` };
                                }
                        }
                        
                        logger.info(`[CanvasEngine] Tool ${toolCall.name} result: ${JSON.stringify(result)}`);
                        toolResults.push(result);
                    } catch (error: any) {
                        logger.error(`[CanvasEngine] Error executing tool ${toolCall.name}:`, error);
                        toolResults.push({ error: error.message });
                    }
                }
            }
            
            // Create a tool message with the results
            const toolMessage = new AIMessage({
                content: `Tool execution completed. Results: ${JSON.stringify(toolResults)}`,
                tool_calls: []
            });
            
            return { messages: [toolMessage] };
        };

        const shouldContinue = (state: typeof MessagesAnnotation.State) => {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                logger.info("[CanvasEngine] Agent wants to use tools, routing to tools node");
                logger.info(`[CanvasEngine] Tool calls detected: ${lastMessage.tool_calls.length}`);
                lastMessage.tool_calls.forEach((call, idx) => {
                    logger.info(`[CanvasEngine] Tool call ${idx}: name=${call.name}, args=${JSON.stringify(call.args)}`);
                });
                return "tools";
            }
            logger.info("[CanvasEngine] Agent finished, ending conversation");
            return END;
        };

        const callAgent = async (state: typeof MessagesAnnotation.State) => {
            const systemPrompt = this.buildSystemPrompt();
            const messages = [new SystemMessage(systemPrompt), ...state.messages];
            
            logger.info(`[CanvasEngine] Calling LLM with ${messages.length} messages`);
            
            try {
                const response = await this.llm.invoke(messages) as AIMessage;
                
                // Validate response structure
                if (!response || typeof response !== 'object') {
                    throw new Error('Invalid response from LLM');
                }
                
                logger.info(`[CanvasEngine] LLM response: ${JSON.stringify({
                    content: typeof response.content === 'string' ? response.content.substring(0, 100) + '...' : response.content,
                    toolCalls: response.tool_calls?.length || 0
                })}`);
                
                return { messages: [response] };
            } catch (error: any) {
                logger.error(`[CanvasEngine] Error calling LLM:`, error);
                
                // Return a fallback response
                const errorMessage = new AIMessage({
                    content: `I encountered an error processing your request: ${error.message}. Please try again with a simpler command.`
                });
                
                return { messages: [errorMessage] };
            }
        };

        const updateCanvasState = (state: typeof MessagesAnnotation.State) => {
            this.updateCanvasStateFromMessages(state.messages);
            return {};
        };

        const workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", callAgent)
            .addNode("tools", executeTools)
            .addNode("update_canvas", updateCanvasState)
            .addEdge(START, "agent")
            .addConditionalEdges("agent", shouldContinue, {
                tools: "tools",
                [END]: END
            })
            .addEdge("tools", "update_canvas")
            .addEdge("update_canvas", "agent");

        return workflow.compile();
    }

    /**
     * Build the system prompt from imported template constants
     */
    private buildSystemPrompt(): string {
        const basePrompt = systemBasePrompt;
        const layoutStrategy = layoutStrategyPrompt;
        
        // Calculate layout parameters
        const layoutParams = this.calculateLayoutParameters();
        
        // Build UI components description
        const uiComponentsDesc = this.uiComponents.map(comp => 
            `- ${comp.name}: Rectangle from (${comp.x}, ${comp.y}) to (${comp.x + comp.width}, ${comp.y + comp.height}) - Width: ${comp.width}px, Height: ${comp.height}px`
        ).join('\n');
        
        // Build canvas state description  
        const canvasStateDesc = this.canvasState.windows.length === 0 
            ? "No windows currently open"
            : this.canvasState.windows.map(w => 
                `- Window "${w.id}": ${w.url} at (${w.x}, ${w.y}) size ${w.width}x${w.height} - Title: ${w.title}`
            ).join('\n');

        // Replace template variables
        const replacements = {
            '{{screenWidth}}': this.workArea.width.toString(),
            '{{screenHeight}}': this.workArea.height.toString(),
            '{{uiComponents}}': uiComponentsDesc,
            '{{defaultX}}': layoutParams.defaultX.toString(),
            '{{defaultY}}': layoutParams.defaultY.toString(),
            '{{defaultHeight}}': layoutParams.defaultHeight.toString(),
            '{{windowGap}}': this.layoutConfig.windowGap.toString(),
            '{{maxUsableWidth}}': layoutParams.maxUsableWidth.toString(),
            '{{minWindowWidth}}': this.layoutConfig.minWindowWidth.toString(),
            '{{canvasState}}': canvasStateDesc
        };

        let filledStrategy = layoutStrategy;
        Object.entries(replacements).forEach(([key, value]) => {
            filledStrategy = filledStrategy.replace(new RegExp(key, 'g'), value);
        });

        return `${basePrompt}\n\n${filledStrategy}`;
    }



    /**
     * Calculate layout parameters based on screen and UI components
     */
    private calculateLayoutParameters() {
        const { screenEdgePadding, menuBarHeight } = this.layoutConfig;
        
        const defaultX = screenEdgePadding;
        const defaultY = screenEdgePadding + menuBarHeight;
        
        // Calculate bottom boundary (avoid InputPill)
        const inputPill = this.uiComponents.find(c => c.name === 'InputPill');
        const maxBottomY = inputPill 
            ? inputPill.y - screenEdgePadding
            : this.workArea.height - 50 - screenEdgePadding;
        
        const defaultHeight = maxBottomY - defaultY;
        
        // Calculate max usable width (avoid AthenaWidget)
        const athenaWidget = this.uiComponents.find(c => c.name === 'AthenaWidget');
        const maxUsableWidth = athenaWidget
            ? athenaWidget.x - screenEdgePadding - this.layoutConfig.windowGap - defaultX
            : this.workArea.width - 2 * screenEdgePadding;
        
        return {
            defaultX,
            defaultY,
            defaultHeight: Math.max(defaultHeight, 200), // Minimum height
            maxUsableWidth: Math.max(maxUsableWidth, this.layoutConfig.minWindowWidth)
        };
    }

    /**
     * Core window operations
     */
    private async openWindow(args: z.infer<typeof openWindowSchema>): Promise<CanvasWindowState> {
        let { url, x, y, width, height, title } = args;
        
        // Normalize URL: add https:// if no protocol is specified
        url = this.normalizeUrl(url);
        
        const newWindow = new BrowserWindow({
            x, y, width, height,
            webPreferences: { 
                nodeIntegration: false, 
                contextIsolation: true 
            },
            show: true,
            frame: false,
            title: title || 'Browser Window'
        });

        const windowId = `window-${newWindow.id}`;
        this.openWindows.set(windowId, newWindow);

        try {
            await newWindow.loadURL(url);
        } catch (error: any) {
            logger.error(`[CanvasEngine] Failed to load URL ${url}:`, error);
            // Close the window if URL loading fails
            newWindow.close();
            this.openWindows.delete(windowId);
            throw new Error(`Failed to load URL: ${url}. ${error.message}`);
        }

        const bounds = newWindow.getBounds();
        const windowTitle = title || newWindow.getTitle();

        // Set up event handlers
        newWindow.on('closed', () => {
            logger.info(`[CanvasEngine] Window ${windowId} closed`);
            this.openWindows.delete(windowId);
            this.canvasState.windows = this.canvasState.windows.filter(w => w.id !== windowId);
        });

        newWindow.on('resize', () => {
            const newBounds = newWindow.getBounds();
            const windowState = this.canvasState.windows.find(w => w.id === windowId);
            if (windowState) {
                Object.assign(windowState, newBounds);
            }
        });

        newWindow.on('move', () => {
            const newBounds = newWindow.getBounds();  
            const windowState = this.canvasState.windows.find(w => w.id === windowId);
            if (windowState) {
                windowState.x = newBounds.x;
                windowState.y = newBounds.y;
            }
        });

        const windowState: CanvasWindowState = {
            id: windowId,
            url,
            x: bounds.x,
            y: bounds.y, 
            width: bounds.width,
            height: bounds.height,
            title: windowTitle
        };

        this.canvasState.windows.push(windowState);
        logger.info(`[CanvasEngine] Window ${windowId} opened successfully`);
        
        return windowState;
    }

    /**
     * Normalize URL by adding protocol if missing
     */
    private normalizeUrl(url: string): string {
        if (!url) return url;
        
        const originalUrl = url;
        
        // If URL already has a protocol, return as-is
        if (url.match(/^https?:\/\//i)) {
            return url;
        }
        
        // If URL starts with //, add https:
        if (url.startsWith('//')) {
            url = `https:${url}`;
        } else {
            // If URL looks like a domain or path, add https://
            url = `https://${url}`;
        }
        
        logger.info(`[CanvasEngine] URL normalized: "${originalUrl}" -> "${url}"`);
        return url;
    }

    private closeWindow(args: z.infer<typeof closeWindowSchema>): { id: string; status: string } {
        const { id } = args;
        const windowInstance = this.openWindows.get(id);
        
        if (!windowInstance) {
            logger.warn(`[CanvasEngine] Window ${id} not found`);
            return { id, status: 'not_found' };
        }

        try {
            windowInstance.close();
            this.openWindows.delete(id);
            this.canvasState.windows = this.canvasState.windows.filter(w => w.id !== id);
            logger.info(`[CanvasEngine] Window ${id} closed successfully`);
            return { id, status: 'closed' };
        } catch (error: any) {
            logger.error(`[CanvasEngine] Error closing window ${id}:`, error);
            return { id, status: 'error' };
        }
    }

    private resizeAndMoveWindow(args: z.infer<typeof resizeAndMoveWindowSchema>): { id: string; status: string; x?: number; y?: number; width?: number; height?: number } {
        const { windowId, x, y, width, height } = args;
        const windowInstance = this.openWindows.get(windowId);
        
        if (!windowInstance) {
            logger.warn(`[CanvasEngine] Window ${windowId} not found`);
            return { id: windowId, status: 'not_found' };
        }

        if (x === undefined && y === undefined && width === undefined && height === undefined) {
            return { id: windowId, status: 'no_changes' };
        }

        try {
            const currentBounds = windowInstance.getBounds();
            const newBounds = { ...currentBounds };
            
            if (x !== undefined) newBounds.x = x;
            if (y !== undefined) newBounds.y = y; 
            if (width !== undefined) newBounds.width = Math.max(100, width);
            if (height !== undefined) newBounds.height = Math.max(100, height);

            // Keep window on screen
            const display = screen.getPrimaryDisplay();
            const { workArea } = display;
            const minVisible = 50;
            
            newBounds.x = Math.max(
                workArea.x - newBounds.width + minVisible,
                Math.min(newBounds.x, workArea.x + workArea.width - minVisible)
            );
            newBounds.y = Math.max(
                workArea.y - newBounds.height + minVisible,
                Math.min(newBounds.y, workArea.y + workArea.height - minVisible)
            );

            windowInstance.setBounds(newBounds);
            const finalBounds = windowInstance.getBounds();

            // Update canvas state
            const windowState = this.canvasState.windows.find(w => w.id === windowId);
            if (windowState) {
                Object.assign(windowState, finalBounds);
            }

            logger.info(`[CanvasEngine] Window ${windowId} resized/moved successfully`);
            return {
                id: windowId,
                status: 'updated',
                ...finalBounds
            };
        } catch (error: any) {
            logger.error(`[CanvasEngine] Error resizing/moving window ${windowId}:`, error);
            return { id: windowId, status: 'error' };
        }
    }

    /**
     * Update canvas state from tool execution messages
     */
    private updateCanvasStateFromMessages(messages: BaseMessage[]): void {
        // The canvas state is already updated by the tool implementations
        // This method can be used for additional state synchronization if needed
        logger.info(`[CanvasEngine] Canvas state updated. Current windows: ${this.canvasState.windows.length}`);
    }

    /**
     * Detect the type of request from user input
     */
    private detectRequestType(userInput: string): { type: 'open' | 'close_all' | 'close_specific' | 'other', target?: string } {
        const lowerInput = userInput.toLowerCase().trim();
        
        // Close all patterns
        if (lowerInput.match(/^(close\s+all|close\s+everything|close\s+all\s+windows)$/)) {
            return { type: 'close_all' };
        }
        
        // Close specific window patterns
        const closeMatch = lowerInput.match(/^close\s+(.+)$/);
        if (closeMatch) {
            return { type: 'close_specific', target: closeMatch[1] };
        }
        
        // Open patterns
        const openMatch = lowerInput.match(/^open\s+(.+)$/);
        if (openMatch) {
            return { type: 'open', target: openMatch[1] };
        }
        
        return { type: 'other' };
    }

    /**
     * Check if the user's request was fulfilled
     */
    private isRequestFulfilled(userInput: string, initialWindowCount: number): boolean {
        const request = this.detectRequestType(userInput);
        
        switch (request.type) {
            case 'open':
                // For open requests, check if new window was created with requested URL
                if (this.canvasState.windows.length <= initialWindowCount) {
                    logger.warn(`[CanvasEngine] Request unfulfilled: No new window opened for "${request.target}"`);
                    return false;
                }
                
                // Check if any window contains the requested URL
                const hasMatchingWindow = this.canvasState.windows.some(window => {
                    const windowUrl = window.url.toLowerCase();
                    const requestUrlLower = (request.target || '').toLowerCase();
                    return windowUrl.includes(requestUrlLower) || 
                           windowUrl.includes(`//${requestUrlLower}`) ||
                           windowUrl.includes(`https://${requestUrlLower}`) ||
                           windowUrl.includes(`https://www.${requestUrlLower}`);
                });
                
                if (!hasMatchingWindow) {
                    logger.warn(`[CanvasEngine] Request unfulfilled: No window found for "${request.target}"`);
                    return false;
                }
                return true;
                
            case 'close_all':
                // For close all requests, check if all windows were closed
                if (this.canvasState.windows.length > 0) {
                    logger.warn(`[CanvasEngine] Request unfulfilled: ${this.canvasState.windows.length} windows still open after "close all"`);
                    return false;
                }
                return true;
                
            case 'close_specific':
                // For specific close requests, this is more complex to validate
                // For now, assume fulfilled if we closed at least one window
                if (this.canvasState.windows.length >= initialWindowCount) {
                    logger.warn(`[CanvasEngine] Request unfulfilled: No windows were closed for "${request.target}"`);
                    return false;
                }
                return true;
                
            case 'other':
            default:
                // For other requests (resize, move, etc.), assume fulfilled
                return true;
        }
    }

    /**
     * Clean up abort signals to prevent memory leaks
     */
    private cleanupAbortSignal(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
    }

    /**
     * Create a new abort controller for the current operation
     */
    private createAbortController(): AbortController {
        this.cleanupAbortSignal();
        this.currentAbortController = new AbortController();
        return this.currentAbortController;
    }

    /**
     * Public API
     */
    async invoke(userInput: string, config: { recursionLimit?: number } = { recursionLimit: 25 }) {
        logger.info(`[CanvasEngine] Processing user input: "${userInput}"`);
        
        const initialWindowCount = this.canvasState.windows.length;
        
        try {
            // Create fresh abort controller for this operation
            const abortController = this.createAbortController();
            const configWithSignal = {
                ...config,
                signal: abortController.signal
            };
            
            // Include conversation history in the state so LLM maintains context
            const initialState = {
                messages: [...this.messages, new HumanMessage(userInput)]
            };

            const finalState = await this.graph.invoke(initialState, configWithSignal);
            
            // Store conversation history (only the new messages from this invocation)
            const newMessages = finalState.messages.slice(this.messages.length);
            this.messages.push(...newMessages);
            
            // Check if the user's request was actually fulfilled
            if (!this.isRequestFulfilled(userInput, initialWindowCount)) {
                logger.warn(`[CanvasEngine] Request not fulfilled, continuing conversation...`);
                
                // Create new abort controller for follow-up
                const followUpController = this.createAbortController();
                const followUpConfig = {
                    recursionLimit: 10,
                    signal: followUpController.signal
                };
                
                // Generate appropriate follow-up message based on request type
                const request = this.detectRequestType(userInput);
                let followUpText = "Please complete the requested task.";
                
                switch (request.type) {
                    case 'open':
                        followUpText = `The requested window for "${request.target}" was not opened yet. Please complete the task by opening the requested window.`;
                        break;
                    case 'close_all':
                        followUpText = `Not all windows were closed. Please continue closing all remaining windows to complete the "close all" request.`;
                        break;
                    case 'close_specific':
                        followUpText = `The window for "${request.target}" was not closed yet. Please complete the task by closing the requested window.`;
                        break;
                }
                
                const followUpMessage = new HumanMessage(followUpText);
                const continueState = {
                    messages: [...this.messages, followUpMessage]
                };
                
                const continuedState = await this.graph.invoke(continueState, followUpConfig);
                
                // Update messages with the continued conversation
                const additionalMessages = continuedState.messages.slice(this.messages.length);
                this.messages.push(...additionalMessages);
                
                logger.info(`[CanvasEngine] Continued processing to ensure completion`);
            }
            
            logger.info(`[CanvasEngine] Completed processing. Windows: ${this.canvasState.windows.length}, Messages: ${this.messages.length}`);
            
            return finalState;
        } finally {
            // Always clean up abort signals when operation completes
            this.cleanupAbortSignal();
        }
    }

    /**
     * Get current canvas state (read-only)
     */
    getCanvasState(): Readonly<CanvasState> {
        return { ...this.canvasState, windows: [...this.canvasState.windows] };
    }

    /**
     * Get conversation history (read-only) 
     */
    getMessages(): ReadonlyArray<BaseMessage> {
        return [...this.messages];
    }

    /**
     * Clear conversation history
     */
    clearHistory(): void {
        this.messages = [];
        this.cleanupAbortSignal(); // Clean up any pending operations
        logger.info('[CanvasEngine] Conversation history cleared');
    }

    /**
     * Cleanup method to call when destroying the engine
     */
    destroy(): void {
        this.cleanupAbortSignal();
        this.openWindows.forEach(window => {
            if (!window.isDestroyed()) {
                window.close();
            }
        });
        this.openWindows.clear();
        this.canvasState.windows = [];
        logger.info('[CanvasEngine] Engine destroyed and resources cleaned up');
    }


} 