import { layoutStrategyPrompt } from '@core/engine/prompts/layout-strategy';
import { systemBasePrompt } from '@core/engine/prompts/system-base';
import { closeWindowSchema, openWindowSchema, resizeAndMoveWindowSchema } from '@core/engine/tools/canvas-tool-schemas';
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StructuredTool, tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import logger from '@utils/logger';
import { BrowserWindow, Rectangle, screen } from 'electron';
import { setMaxListeners } from 'events';
import { z } from 'zod';

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

export interface LLMConfig {
    provider: 'google' | 'openai' | 'anthropic';
    apiKey: string;
    modelName: string;
    temperature?: number;
    maxTokens?: number;
}

// TODO: Provider abstraction for future migration to OpenAI/Claude
// Will re-enable when migrating from Gemini

/**
 * Canvas Engine for LaserFocus
 * Manages browser windows using LangGraph with proper persistence
 * 
 * ⚠️  TECHNICAL DEBT WARNING ⚠️
 * 
 * This implementation contains significant hardcoded workarounds for Google Gemini's
 * poor schema adherence. These hacks should NOT be part of the final design and
 * must be removed when migrating to better LLMs (OpenAI GPT-4, Claude, etc.).
 * 
 * GEMINI-SPECIFIC ISSUES BEING WORKED AROUND:
 * 1. Schema violations: Sends "input" instead of "windowId" parameter names
 * 2. Parameter filtering: Zod strips invalid fields, causing data loss
 * 3. Unpredictable argument formats: Sometimes string, sometimes object
 * 4. Poor tool planning: Doesn't respect schema parameter requirements
 * 
 * WORKAROUNDS IMPLEMENTED (TO BE REMOVED):
 * - Parameter name auto-fixing (input → windowId)
 * - Intelligent layout fallbacks when parameters are lost
 * - Predictive 3-window layout detection
 * - String argument handling for malformed tool calls
 * 
 * MIGRATION PATH:
 * When switching to OpenAI/Claude:
 * 1. Remove all "GEMINI-SPECIFIC FIX" code blocks
 * 2. Restore clean schema-based parameter handling
 * 3. Remove fallback layout calculations
 * 4. Simplify resizeAndMoveWindow() to standard implementation
 * 
 * The core architecture (LangGraph, tool system, state management) is sound
 * and provider-agnostic. Only the parameter handling workarounds need removal.
 */
export class CanvasEngine {
    private readonly llmConfig: LLMConfig;
    private readonly workArea: Rectangle;
    private readonly tools: StructuredTool[];
    private readonly graph: any;
    private readonly threadId: string = "canvas-session"; // Persistent conversation thread
    
    // State management - LangGraph handles conversation history automatically
    private canvasState: CanvasState = { windows: [] };
    private openWindows: Map<string, BrowserWindow> = new Map();
    private uiComponents: UIComponentBounds[] = [];
    
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
        // Increase EventTarget max listeners to handle multiple LLM calls per conversation
        setMaxListeners(50);
        
        this.workArea = screen.getPrimaryDisplay().workArea; 
        
        // Store config for future provider abstraction
        const resolvedApiKey = apiKey || process.env.GOOGLE_API_KEY || "";
        if (!resolvedApiKey) {
            throw new Error("GOOGLE_API_KEY is required");
        }
        
        // Basic API key validation
        if (!resolvedApiKey.startsWith('AIza')) {
            logger.warn('[CanvasEngine] API key does not look like a valid Google AI key (should start with AIza)');
        }
        
        logger.info(`[CanvasEngine] Using API key: ${resolvedApiKey.substring(0, 8)}...${resolvedApiKey.substring(resolvedApiKey.length - 4)}`);
        
        this.llmConfig = {
            provider: 'google',
            apiKey: resolvedApiKey,
            modelName,
            temperature: 0.2,
            maxTokens: 2048
        };
        
        this.setupUIComponents(inputPillWindow, athenaWidgetWindow);
        this.tools = this.createTools(externalTools);
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
                return this.resizeAndMoveWindow(args);
            },
            {
                name: "resize_and_move_window",
                description: "Resizes and/or moves an existing browser window. REQUIRED: windowId parameter (the window ID to modify). OPTIONAL: x, y, width, height parameters.",
                schema: resizeAndMoveWindowSchema
            }
        );

        logger.info(`[CanvasEngine] Tools created: ${[openWindowTool, closeWindowTool, resizeMoveTool, ...externalTools].map(t => t.name)}`);
        return [openWindowTool, closeWindowTool, resizeMoveTool, ...externalTools];
    }

    /**
     * Build the LangGraph workflow with persistent memory
     */
    private buildGraph() {
        // Create LLM with tool binding - GEMINI-OPTIMIZED for now, provider-agnostic later
        const model = new ChatGoogleGenerativeAI({
            apiKey: this.llmConfig.apiKey,
            model: this.llmConfig.modelName,
            temperature: this.llmConfig.temperature,
            maxOutputTokens: this.llmConfig.maxTokens,
        }).bindTools(this.tools);

        // Use standard LangGraph ToolNode - the architecturally correct approach
        const toolNode = new ToolNode(this.tools);

        // Simple conditional logic: tool calls = continue, no tool calls = end  
        const shouldContinue = (state: typeof MessagesAnnotation.State) => {
            const lastMessage = state.messages[state.messages.length - 1];
            
            if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                logger.info("[CanvasEngine] Agent wants to use tools, routing to tools node");
                return "tools";
            }
            
            // Check if we just had tool execution in the last few messages
            const recentMessages = state.messages.slice(-4); 
            const hasRecentToolMessage = recentMessages.some(msg => {
                if (msg && typeof msg === 'object' && 'type' in msg) {
                    return msg.type === 'tool';
                }
                return false;
            });
            
            // If we just executed tools and agent responds, allow natural ending
            if (hasRecentToolMessage && lastMessage instanceof AIMessage && 
                (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)) {
                logger.info("[CanvasEngine] Agent responded after tool execution - ending conversation");
                return END;
            }
            
            // Count forced continuations for safety limit
            const agentMessages = state.messages.filter(msg => msg instanceof AIMessage);
            const forcedContinuations = agentMessages.filter(msg => 
                !msg.tool_calls || msg.tool_calls.length === 0
            ).length;
            
            // Safety valve: don't force too many continuations
            if (lastMessage instanceof AIMessage && (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)) {
                if (forcedContinuations >= 2) {
                    logger.info("[CanvasEngine] Too many forced continuations, allowing natural end");
                    return END;
                } else {
                    logger.warn(`[CanvasEngine] Agent provided no tool calls (attempt ${forcedContinuations + 1}/2) - forcing continuation`);
                    return "agent";
                }
            }
            
            logger.info("[CanvasEngine] Default end condition reached");
            return END;
        };

        const callAgent = async (state: typeof MessagesAnnotation.State) => {
            const systemPrompt = this.buildSystemPrompt();
            const messages = [new SystemMessage(systemPrompt), ...state.messages];
            
            logger.info(`[CanvasEngine] Calling LLM with ${messages.length} messages`);
            logger.info(`[CanvasEngine] API Key configured: ${this.llmConfig.apiKey ? 'YES' : 'NO'}`);
            logger.info(`[CanvasEngine] Model: ${this.llmConfig.modelName}`);
            
            try {
                // Add timeout to catch hanging requests with proper cleanup
                const abortController = new AbortController();
                const timeoutId = setTimeout(() => {
                    abortController.abort();
                }, 30000);
                
                const timeoutPromise = new Promise<never>((_, reject) => {
                    abortController.signal.addEventListener('abort', () => {
                        reject(new Error('LLM request timeout after 30 seconds'));
                    });
                });
                
                let response: AIMessage;
                try {
                    response = await Promise.race([
                        model.invoke(messages, { signal: abortController.signal }).catch(error => {
                            if (error.name === 'AbortError') {
                                throw new Error('LLM request timeout after 30 seconds');
                            }
                            throw error;
                        }),
                        timeoutPromise
                    ]) as AIMessage;
                } finally {
                    // Always clean up resources
                    clearTimeout(timeoutId);
                    if (!abortController.signal.aborted) {
                        abortController.abort();
                    }
                }
                
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

        const workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", callAgent)
            .addNode("tools", toolNode)
            .addEdge(START, "agent")
            .addConditionalEdges("agent", shouldContinue, {
                tools: "tools",
                agent: "agent",  // Allow agent→agent looping for forced continuation
                [END]: END
            })
            .addEdge("tools", "agent");

        // Compile with persistent memory checkpointer
        const checkpointer = new MemorySaver();
        return workflow.compile({ checkpointer });
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
        // ======================================================================
        // 🚨 GEMINI-SPECIFIC WORKAROUND - REMOVE WHEN MIGRATING TO OPENAI/CLAUDE
        // ======================================================================
        // Handles Gemini's schema violations where it sends "input" instead of "windowId"
        // and Zod filtering that causes parameter loss. This entire block should be
        // replaced with simple destructuring: const { windowId, x, y, width, height } = args;
        let windowId: string | undefined;
        let x: number | undefined, y: number | undefined, width: number | undefined, height: number | undefined;
        
        logger.info(`[CanvasEngine] Raw args type: ${typeof args}, value: ${JSON.stringify(args)}`);
        
        // Handle different argument formats due to Gemini schema violations
        if (typeof args === 'string') {
            // LangChain sometimes passes just the windowId as a string when schema validation partially fails
            windowId = args;
            logger.info(`[CanvasEngine] Args received as string (windowId): "${windowId}"`);
        } else if (typeof args === 'object' && args !== null) {
            const rawArgs = args as any;
            // Try multiple field names that Gemini might use
            windowId = args.windowId || rawArgs.input || rawArgs.id || rawArgs.windowId;
            x = args.x;
            y = args.y; 
            width = args.width;
            height = args.height;
            
            logger.info(`[CanvasEngine] Args received as object - windowId: "${args.windowId}", input: "${rawArgs.input}", final: "${windowId}"`);
        }
        
        if (!windowId) {
            logger.error(`[CanvasEngine] No valid windowId found in args: ${JSON.stringify(args)}`);
            return { id: 'unknown', status: 'missing_id' };
        }

        // ======================================================================
        // 🚨 GEMINI-SPECIFIC WORKAROUND - REMOVE WHEN MIGRATING TO OPENAI/CLAUDE  
        // ======================================================================
        // When Gemini's schema violations cause parameter loss, this provides intelligent
        // layout fallbacks. With proper LLMs, this entire block becomes unnecessary as
        // parameters will be correctly provided by the LLM.
        if (typeof args === 'string' || (x === undefined && y === undefined && width === undefined && height === undefined)) {
            logger.info(`[CanvasEngine] Missing resize parameters due to schema filtering. Calculating smart defaults.`);
            
            const layoutParams = this.calculateLayoutParameters();
            const windowCount = this.canvasState.windows.length;
            const windowIndex = this.canvasState.windows.findIndex(w => w.id === windowId);
            
            logger.info(`[CanvasEngine] Context: ${windowCount} windows total, resizing window ${windowIndex + 1}`);
            
            // Detect if we're preparing for a 3+ window layout by checking recent conversation
            // If we're resizing existing windows, Gemini is likely preparing for a new window
            const isPreparingForNewWindow = windowCount >= 2; // Assume 3-window layout if resizing with 2+ windows
            const targetLayout = isPreparingForNewWindow ? 3 : windowCount + 1;
            
            logger.info(`[CanvasEngine] Detected layout intent: ${targetLayout}-window layout (preparing: ${isPreparingForNewWindow})`);
            
            // Smart layout based on predicted final layout
            if (targetLayout <= 2) {
                // 2-window side-by-side layout
                x = layoutParams.defaultX; 
                y = layoutParams.defaultY;   
                width = Math.floor(layoutParams.maxUsableWidth / 2) - Math.floor(this.layoutConfig.windowGap / 2);
                height = layoutParams.defaultHeight;
                                 logger.info(`[CanvasEngine] Using 2-window side-by-side layout`);
             } else {
                 // 3+ window layout: first window takes top half, others split bottom
                 if (windowIndex === 0) {
                     // First window: full width, top half
                     x = layoutParams.defaultX;
                     y = layoutParams.defaultY;
                     width = layoutParams.maxUsableWidth;
                     height = Math.floor(layoutParams.defaultHeight / 2) - Math.floor(this.layoutConfig.windowGap / 2);
                     logger.info(`[CanvasEngine] Using 3-window layout: first window (top half)`);
                 } else {
                     // Other windows: split bottom half
                     const expectedBottomWindows = Math.max(2, targetLayout - 1); // At least 2 bottom windows for 3+ layout
                     const bottomWidth = Math.floor(layoutParams.maxUsableWidth / expectedBottomWindows) - Math.floor(this.layoutConfig.windowGap / 2);
                     x = layoutParams.defaultX + (windowIndex - 1) * (bottomWidth + this.layoutConfig.windowGap);
                     y = layoutParams.defaultY + Math.floor(layoutParams.defaultHeight / 2) + this.layoutConfig.windowGap;
                     width = bottomWidth;
                     height = Math.floor(layoutParams.defaultHeight / 2) - Math.floor(this.layoutConfig.windowGap / 2);
                     logger.info(`[CanvasEngine] Using 3-window layout: bottom window ${windowIndex} (expecting ${expectedBottomWindows} bottom windows)`);
                 }
            }
            
            logger.info(`[CanvasEngine] Using smart fallback resize: x=${x}, y=${y}, width=${width}, height=${height}`);
        }

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
     * Send user input to the persistent conversational agent
     * Uses LangGraph's built-in persistence for conversation memory
     */
    async invoke(userInput: string): Promise<string> {
        logger.info(`[CanvasEngine] Processing user input: "${userInput}"`);
        
        const initialWindowCount = this.canvasState.windows.length;
        
        try {
            const config = { configurable: { thread_id: this.threadId } };
            const input = { messages: [new HumanMessage(userInput)] };
            
            // Use invoke instead of stream to avoid AbortSignal accumulation
            await this.graph.invoke(input, config);
            
            // Generate action summary based on tool executions and canvas state changes
            const actionSummary = this.generateActionSummary(userInput, initialWindowCount);
            
            logger.info(`[CanvasEngine] Completed processing. Windows: ${this.canvasState.windows.length}`);
            return actionSummary;
            
        } catch (error: any) {
            logger.error(`[CanvasEngine] Error processing request:`, error);
            throw new Error(`Failed to process request: ${error.message}`);
        }
    }

    /**
     * Generate a meaningful summary of actions performed for display in AthenaWidget
     */
    private generateActionSummary(userInput: string, initialWindowCount: number): string {
        const currentWindowCount = this.canvasState.windows.length;
        const windowChange = currentWindowCount - initialWindowCount;
        
        // Detect the type of request
        const lowerInput = userInput.toLowerCase().trim();
        
        if (lowerInput.startsWith('open ')) {
            const match = lowerInput.match(/^open\s+(.+)$/);
            const targetSite = match ? match[1] : 'site';
            
            if (windowChange > 0) {
                // New window was opened
                const newWindow = this.canvasState.windows[this.canvasState.windows.length - 1];
                if (currentWindowCount === 1) {
                    return `✅ Opened ${targetSite}`;
                } else {
                    return `✅ Arranged ${currentWindowCount} windows and opened ${targetSite}`;
                }
            } else {
                return `❌ Failed to open ${targetSite}`;
            }
        }
        
        if (lowerInput.includes('close all')) {
            if (currentWindowCount === 0) {
                return `✅ Closed all windows`;
            } else {
                return `⚠️ Closed some windows (${currentWindowCount} remaining)`;
            }
        }
        
        if (lowerInput.startsWith('close ')) {
            const closedCount = Math.abs(windowChange);
            if (closedCount > 0) {
                return `✅ Closed ${closedCount} window${closedCount > 1 ? 's' : ''}`;
            } else {
                return `⚠️ No windows were closed`;
            }
        }
        
        // For other operations (resize, move, etc.)
        if (currentWindowCount > 0) {
            return `✅ Canvas updated (${currentWindowCount} window${currentWindowCount > 1 ? 's' : ''})`;
        } else {
            return `✅ Task completed`;
        }
    }

    /**
     * Get current canvas state (read-only)
     */
    getCanvasState(): Readonly<CanvasState> {
        return { ...this.canvasState, windows: [...this.canvasState.windows] };
    }

    /**
     * Clear conversation history (reset the persistent thread)
     */
    clearHistory(): void {
        // With LangGraph persistence, we'd need to clear the checkpointer state
        // For now, just create a new thread ID
        (this as any).threadId = `canvas-session-${Date.now()}`;
        logger.info('[CanvasEngine] Conversation history cleared - new thread started');
    }

    /**
     * Cleanup method to call when destroying the engine
     */
    destroy(): void {
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