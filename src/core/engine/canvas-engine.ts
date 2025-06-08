import type {
    CanvasState,
    CanvasWindowState,
    LayoutConfig,
    LLMConfig,
    PlatformComponentConfig
} from '@/lib/types/canvas';
import { layoutStrategyPrompt } from '@core/engine/prompts/layout-strategy';
import { systemBasePrompt } from '@core/engine/prompts/system-base';
import { buildUIComponentsDescription } from '@core/engine/prompts/ui-components';
import { closeWindowSchema, openWindowSchema, resizeAndMoveWindowSchema } from '@core/engine/tools/canvas-tool-schemas';
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StructuredTool, tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import logger from '@utils/logger';
import { BrowserWindow, Rectangle, screen } from 'electron';
import { setMaxListeners } from 'events';
import path from 'path';
import { z } from 'zod';

// TODO: Provider abstraction for future migration to OpenAI/Claude
// Will re-enable when migrating from Gemini

/**
 * Canvas Engine for LaserFocus
 * Manages browser windows using LangGraph with proper persistence
 * 
 * ARCHITECTURAL EVOLUTION ROADMAP:
 * 
 * PHASE 1 (CURRENT): Consistent event handling across all window types
 * - ✅ Add missing move/resize listeners for platform components
 * - ✅ Unified platform component tracking helper
 * - ✅ Consistent logging and state management
 * 
 * PHASE 2 (MEDIUM-TERM): Extensible foundation
 * - 🔄 WindowTracker class for unified window lifecycle management
 * - 🔄 LayoutContextProvider for centralized layout calculations
 * - 🔄 Generic platform component registration (no hard-coded types)
 * - 🔄 Plugin system for layout strategies
 * 
 * PHASE 3 (LONG-TERM): Full context awareness
 * - 🔮 Event-driven architecture with real-time context updates
 * - 🔮 Agent prompt updates triggered by UI changes
 * - 🔮 Context-aware tool suggestions
 * - 🔮 Dynamic layout optimization based on usage patterns
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
    private llmConfig: LLMConfig;
    private readonly workArea: Rectangle;
    private readonly tools: StructuredTool[];
    private readonly graph: any;
    private readonly threadId: string = "canvas-session"; // Persistent conversation thread
    
    // State management - LangGraph handles conversation history automatically
    // PHASE 2 TODO: Replace these with WindowTracker and LayoutContextProvider
    private canvasState: CanvasState = { windows: [] };
    private openWindows: Map<string, BrowserWindow> = new Map();
    
    // PHASE 3 TODO: Add EventEmitter inheritance for real-time context updates
    // export class CanvasEngine extends EventEmitter {
    
    // Platform component management
    private platformRegistry: Map<string, PlatformComponentConfig> = new Map();
    private platformInstances: Map<string, any> = new Map();
    private uiConfig: { primaryDisplay: any; viteDevServerUrl: string | undefined; preloadBasePath: string } | null = null;
    private uiDiscoveryService: any = null; // Will be typed properly when imported
    
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
        const resolvedApiKey = apiKey || process.env.GOOGLE_API_KEY;
        
        // Initialize with placeholder config if no API key is provided
        if (!resolvedApiKey) {
            logger.warn('[CanvasEngine] No API key provided - engine initialized in limited mode. Some features may not work until API key is set.');
            this.llmConfig = {
                provider: 'google',
                apiKey: '', // Empty until set later
                modelName,
                temperature: 0.2,
                maxTokens: 2048
            };
        } else {
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
        }
        
        this.setupUIComponents(inputPillWindow, athenaWidgetWindow);
        this.tools = this.createTools(externalTools);
        this.graph = this.buildGraph();
    }

    /**
     * Register a platform component with the Canvas Engine
     */
    registerPlatformComponent(config: PlatformComponentConfig): void {
        this.platformRegistry.set(config.name, config);
        logger.info(`[CanvasEngine] Registered platform component: ${config.name}`);
    }

    /**
     * Set UI configuration for platform component creation
     */
    setUIConfig(config: { primaryDisplay: any; viteDevServerUrl: string | undefined; preloadBasePath: string }): void {
        this.uiConfig = config;
        logger.info(`[CanvasEngine] UI configuration set`);
    }

    /**
     * Set UI discovery service reference for accessing available components
     */
    setUIDiscoveryService(service: any): void {
        this.uiDiscoveryService = service;
    }

    /**
     * Get all available UI components for agent context
     */
    getAvailableUIComponents(): {
        platform: string[];
        apps: string[];
        widgets: string[];
    } {
        if (this.uiDiscoveryService) {
            return {
                platform: this.uiDiscoveryService.getPlatformComponents(),
                apps: this.uiDiscoveryService.getAvailableApplications(),
                widgets: [] // TODO: Add widgets method to UIDiscoveryService
            };
        }
        
        return {
            platform: Array.from(this.platformRegistry.keys()),
            apps: [],
            widgets: []
        };
    }

    /**
     * Get platform component instance by name
     */
    getPlatformInstance(componentName: string): any {
        return this.platformInstances.get(componentName);
    }

    /**
     * Set up platform component tracking for layout calculations
     * 
     * PHASE 1: Add missing event listeners for consistent state management
     * PHASE 2: Replace with unified WindowTracker class for all window types
     * PHASE 3: Implement LayoutContextProvider with real-time context updates
     */
    private setupUIComponents(inputPillWindow?: BrowserWindow, athenaWidgetWindow?: BrowserWindow): void {
        // PHASE 2 TODO: Replace this method with WindowTracker.trackPlatformComponent()
        // This will eliminate code duplication between platform components and browser windows
        
        if (inputPillWindow && !inputPillWindow.isDestroyed()) {
            this.setupPlatformComponentTracking(
                inputPillWindow, 
                'InputPill', 
                'platform://InputPill'
            );
        }

        if (athenaWidgetWindow && !athenaWidgetWindow.isDestroyed()) {
            this.setupPlatformComponentTracking(
                athenaWidgetWindow, 
                'AthenaWidget', 
                'platform://AthenaWidget'
            );
        }
        
        // PHASE 3 TODO: Emit 'layout-context-changed' event here
        // This will trigger real-time agent context updates when platform components change
        logger.info(`[CanvasEngine] Platform components initialized. Layout context ready.`);
    }

    /**
     * Helper method to set up tracking for a platform component
     * 
     * PHASE 1: DRY principle - unified setup for all platform components
     * PHASE 2: This becomes part of the WindowTracker class
     * PHASE 3: Extended with context-aware event emission
     */
    private setupPlatformComponentTracking(
        window: BrowserWindow, 
        componentName: string, 
        url: string
    ): void {
        const bounds = window.getBounds();
        const windowId = `platform-${window.id}`;
        
        // Track window instance
        this.openWindows.set(windowId, window);
        
        // Create window state
        const windowState: CanvasWindowState = {
            id: windowId,
            url,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            title: componentName,
            type: 'platform',
            componentName
        };
        
        this.canvasState.windows.push(windowState);

        // PHASE 1: Add missing event listeners (consistency with browser windows)
        window.on('move', () => {
            const newBounds = window.getBounds();
            const state = this.canvasState.windows.find(w => w.id === windowId);
            if (state) {
                state.x = newBounds.x;
                state.y = newBounds.y;
                logger.info(`[CanvasEngine] ${componentName} moved to (${newBounds.x}, ${newBounds.y})`);
                
                // PHASE 3 TODO: Emit layout-context-changed event here
                // this.emit('layout-context-changed', this.getLayoutContext());
            }
        });

        window.on('resize', () => {
            const newBounds = window.getBounds();
            const state = this.canvasState.windows.find(w => w.id === windowId);
            if (state) {
                Object.assign(state, newBounds);
                logger.info(`[CanvasEngine] ${componentName} resized to ${newBounds.width}x${newBounds.height}`);
                
                // PHASE 3 TODO: Emit layout-context-changed event here
                // this.emit('layout-context-changed', this.getLayoutContext());
            }
        });

        window.on('closed', () => {
            logger.info(`[CanvasEngine] Platform component ${componentName} closed`);
            this.openWindows.delete(windowId);
            this.canvasState.windows = this.canvasState.windows.filter(w => w.id !== windowId);
            
            // PHASE 3 TODO: Emit layout-context-changed event here
            // this.emit('layout-context-changed', this.getLayoutContext());
        });

        logger.info(`[CanvasEngine] ${componentName} tracking initialized at (${bounds.x}, ${bounds.y}) size ${bounds.width}x${bounds.height}`);
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
            // Check if API key is available
            if (!this.hasValidApiKey()) {
                logger.warn('[CanvasEngine] No valid API key available - returning error message');
                const errorMessage = new AIMessage({
                    content: `⚠️ No API key configured. Please set up your API key using the key helper widget to enable AI features.`
                });
                return { messages: [errorMessage] };
            }

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
     * 
     * PHASE 1: Current implementation with real-time platform component positions
     * PHASE 2: Use LayoutContextProvider for cleaner context building
     * PHASE 3: Context-aware prompting with dynamic updates
     */
    private buildSystemPrompt(): string {
        const basePrompt = systemBasePrompt;
        const layoutStrategy = layoutStrategyPrompt;
        
        // PHASE 1: Now gets real-time positions thanks to event listeners
        const layoutParams = this.calculateLayoutParameters();
        
        // PHASE 2 TODO: Replace with layoutContextProvider.getUIComponentsDescription()
        const platformComponents = this.canvasState.windows.filter(w => w.type === 'platform');
        const uiComponentsDesc = platformComponents.map(comp => 
            `- ${comp.title || comp.componentName}: Rectangle from (${comp.x}, ${comp.y}) to (${comp.x + comp.width}, ${comp.y + comp.height}) - Width: ${comp.width}px, Height: ${comp.height}px`
        ).join('\n');
        
        // Build user content windows description (browser and app windows)
        const userWindows = this.canvasState.windows.filter(w => w.type === 'browser' || w.type === 'app');
        const userWindowsDesc = userWindows.length === 0 
            ? "No user content windows currently open"
            : userWindows.map(w => 
                `- Window "${w.id}": ${w.url || w.componentName} at (${w.x}, ${w.y}) size ${w.width}x${w.height} - Title: ${w.title}`
            ).join('\n');

        // Build available UI components description using the new prompt system
        const availableUIComponents = this.getAvailableUIComponents();
        const availableUIComponentsDesc = buildUIComponentsDescription(availableUIComponents);

        // PHASE 3 TODO: Add context freshness timestamp and change detection
        // This will help the agent understand when the layout context was last updated

        // Replace template variables
        const replacements = {
            '{{screenWidth}}': this.workArea.width.toString(),
            '{{screenHeight}}': this.workArea.height.toString(),
            '{{uiComponents}}': availableUIComponentsDesc,
            '{{defaultX}}': layoutParams.defaultX.toString(),
            '{{defaultY}}': layoutParams.defaultY.toString(),
            '{{defaultHeight}}': layoutParams.defaultHeight.toString(),
            '{{windowGap}}': this.layoutConfig.windowGap.toString(),
            '{{maxUsableWidth}}': layoutParams.maxUsableWidth.toString(),
            '{{minWindowWidth}}': this.layoutConfig.minWindowWidth.toString(),
            '{{userWindows}}': userWindowsDesc,
            '{{userWindowCount}}': userWindows.length.toString()
        };

        // Debug logging to see what Gemini is being told
        logger.info(`[CanvasEngine] System prompt key values - userWindowCount: ${userWindows.length}, userWindows: ${userWindows.length > 0 ? userWindows.map(w => w.id).join(', ') : 'none'}`);

        let filledStrategy = layoutStrategy;
        Object.entries(replacements).forEach(([key, value]) => {
            filledStrategy = filledStrategy.replace(new RegExp(key, 'g'), value);
        });

        return `${basePrompt}\n\n${filledStrategy}`;
    }

    /**
     * Calculate layout parameters based on screen and UI components
     * 
     * PHASE 1: Current implementation - works with tracked platform components
     * PHASE 2: Replace with LayoutContextProvider.getAvailableArea()
     * PHASE 3: Real-time context updates with caching and optimization
     */
    private calculateLayoutParameters() {
        const { screenEdgePadding, menuBarHeight } = this.layoutConfig;
        
        const defaultX = screenEdgePadding;
        const defaultY = screenEdgePadding + menuBarHeight;
        
        // PHASE 2 TODO: Replace with generic platform component boundary calculation
        // const reservedAreas = this.layoutContextProvider.getReservedAreas();
        
        // Calculate bottom boundary (avoid InputPill)
        const inputPill = this.canvasState.windows.find(w => w.componentName === 'InputPill');
        const maxBottomY = inputPill 
            ? inputPill.y - screenEdgePadding
            : this.workArea.height - 50 - screenEdgePadding;
        
        const defaultHeight = maxBottomY - defaultY;
        
        // Calculate max usable width (avoid AthenaWidget)
        const athenaWidget = this.canvasState.windows.find(w => w.componentName === 'AthenaWidget');
        const maxUsableWidth = athenaWidget
            ? athenaWidget.x - screenEdgePadding - this.layoutConfig.windowGap - defaultX
            : this.workArea.width - 2 * screenEdgePadding;
        
        // PHASE 3 TODO: Cache these calculations and only recalculate on layout-context-changed events
        
        return {
            defaultX,
            defaultY,
            defaultHeight: Math.max(defaultHeight, 200), // Minimum height
            maxUsableWidth: Math.max(maxUsableWidth, this.layoutConfig.minWindowWidth)
        };
    }

    /**
     * Core window operations - handles both browser windows and UI components
     */
    async openWindow(args: z.infer<typeof openWindowSchema>): Promise<CanvasWindowState> {
        let { url, x, y, width, height, title } = args;
        
        // Check for URL schemes first
        if (url.startsWith('platform://')) {
            return this.openPlatformComponent(url.replace('platform://', ''), { x, y, width, height, title });
        }
        if (url.startsWith('apps://')) {
            return this.openApplication(url.replace('apps://', ''), { x, y, width, height, title });
        }
        if (url.startsWith('widgets://')) {
            return this.openWidget(url.replace('widgets://', ''), { x, y, width, height, title });
        }
        
        // Default: handle as browser window
        return this.openBrowserWindow(args);
    }

    /**
     * Open a browser window (original functionality)
     */
    private async openBrowserWindow(args: z.infer<typeof openWindowSchema>): Promise<CanvasWindowState> {
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
            title: windowTitle,
            type: 'browser'
        };

        this.canvasState.windows.push(windowState);
        logger.info(`[CanvasEngine] Window ${windowId} opened successfully`);
        
        return windowState;
    }

    /**
     * Open a platform component
     */
    private async openPlatformComponent(
        componentName: string, 
        options: { x?: number; y?: number; width?: number; height?: number; title?: string }
    ): Promise<CanvasWindowState> {
        const config = this.platformRegistry.get(componentName);
        if (!config) {
            throw new Error(`Platform component '${componentName}' not found`);
        }

        // Check if already instantiated
        let instance = this.platformInstances.get(componentName);
        if (instance) {
            // Focus existing window
            if (instance.window && !instance.window.isDestroyed()) {
                instance.focus();
                const bounds = instance.window.getBounds();
                const existingState = this.canvasState.windows.find(w => w.componentName === componentName);
                if (existingState) {
                    return existingState;
                }
            }
        }

        // Create new instance
        try {
            const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.getUIConfig();
            const preloadPath = path.join(preloadBasePath, `../ui/${config.fullPath}/preload.js`);
            
            instance = new config.MainClass(primaryDisplay, viteDevServerUrl, preloadPath);
            
            if (instance.init && typeof instance.init === 'function') {
                instance.init();
                this.platformInstances.set(componentName, instance);
                
                // Get the window and add to tracking
                if (instance.window) {
                    const windowId = `platform-${instance.window.id}`;
                    this.openWindows.set(windowId, instance.window);
                    
                    const bounds = instance.window.getBounds();
                    const windowState: CanvasWindowState = {
                        id: windowId,
                        url: `platform://${componentName}`,
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                        title: componentName,
                        type: 'platform',
                        componentName
                    };

                    // Set up event handlers
                    instance.window.on('closed', () => {
                        logger.info(`[CanvasEngine] Platform component ${componentName} closed`);
                        this.openWindows.delete(windowId);
                        this.platformInstances.delete(componentName);
                        this.canvasState.windows = this.canvasState.windows.filter(w => w.id !== windowId);
                    });

                    this.canvasState.windows.push(windowState);
                    
                    logger.info(`[CanvasEngine] Platform component ${componentName} opened successfully`);
                    
                    return windowState;
                }
            }
        } catch (error) {
            logger.error(`[CanvasEngine] Failed to initialize platform component ${componentName}:`, error);
            throw new Error(`Failed to open platform component: ${componentName}`);
        }

        throw new Error(`Failed to create platform component window: ${componentName}`);
    }

    /**
     * Open an application (integrates with UIDiscoveryService to open apps)
     */
    private async openApplication(
        appName: string, 
        options: { x?: number; y?: number; width?: number; height?: number; title?: string }
    ): Promise<CanvasWindowState> {
        // Get available UI components to find the app
        const availableComponents = this.getAvailableUIComponents();
        
        if (!availableComponents.apps.includes(appName)) {
            throw new Error(`Application '${appName}' not found. Available apps: ${availableComponents.apps.join(', ')}`);
        }

        // Use UI Discovery Service to initialize the application
        if (!this.uiDiscoveryService) {
            throw new Error('UI Discovery Service not available for opening applications');
        }

        try {
            // Use UI Discovery Service to initialize the app window
            const appModule = await this.uiDiscoveryService.initializeUIWindow(appName);
            
            if (!appModule || !appModule.instance || !appModule.instance.window) {
                throw new Error(`Failed to initialize application: ${appName}`);
            }
            
            const instance = appModule.instance;
            const windowId = `app-${instance.window.id}`;
            this.openWindows.set(windowId, instance.window);
            
            // Apply position/size options if provided
            if (options.x !== undefined || options.y !== undefined || options.width !== undefined || options.height !== undefined) {
                const currentBounds = instance.window.getBounds();
                const newBounds = {
                    x: options.x ?? currentBounds.x,
                    y: options.y ?? currentBounds.y,
                    width: options.width ?? currentBounds.width,
                    height: options.height ?? currentBounds.height
                };
                instance.window.setBounds(newBounds);
            }
            
            const bounds = instance.window.getBounds();
            const windowState: CanvasWindowState = {
                id: windowId,
                url: `apps://${appName}`,
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                title: options.title || appName,
                type: 'app',
                componentName: appName
            };

            // Set up event handlers
            instance.window.on('closed', () => {
                logger.info(`[CanvasEngine] Application ${appName} closed`);
                this.openWindows.delete(windowId);
                this.canvasState.windows = this.canvasState.windows.filter(w => w.id !== windowId);
            });

            this.canvasState.windows.push(windowState);
            
            logger.info(`[CanvasEngine] Application ${appName} opened successfully`);
            
            return windowState;
            
        } catch (error) {
            logger.error(`[CanvasEngine] Failed to open application ${appName}:`, error);
            throw new Error(`Failed to open application: ${appName}. ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Open a widget (placeholder - will be implemented when integrating with UIDiscoveryService)
     */
    private async openWidget(
        widgetName: string, 
        options: { x?: number; y?: number; width?: number; height?: number; title?: string }
    ): Promise<CanvasWindowState> {
        // TODO: Implement widget opening when integrating with UIDiscoveryService
        throw new Error(`Widget opening not yet implemented: ${widgetName}`);
    }

    /**
     * Get UI configuration
     */
    private getUIConfig(): { primaryDisplay: any; viteDevServerUrl: string | undefined; preloadBasePath: string } {
        if (!this.uiConfig) {
            throw new Error('UI configuration not set. Call setUIConfig() before creating platform components.');
        }
        return this.uiConfig;
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
            // Try to parse as JSON string first (common Gemini issue)
            try {
                const parsedArgs = JSON.parse(args);
                if (typeof parsedArgs === 'object' && parsedArgs !== null) {
                    windowId = parsedArgs.windowId || parsedArgs.input || parsedArgs.id;
                    x = parsedArgs.x;
                    y = parsedArgs.y;
                    width = parsedArgs.width;
                    height = parsedArgs.height;
                    logger.info(`[CanvasEngine] Successfully parsed JSON string args - windowId: "${windowId}", x: ${x}, y: ${y}, width: ${width}, height: ${height}`);
                } else {
                    // Fallback: treat as plain windowId string
                    windowId = args;
                    logger.info(`[CanvasEngine] Args received as plain string (windowId): "${windowId}"`);
                }
            } catch (jsonError) {
                // Check if it's a comma-separated parameter string (another Gemini format)
                const argsStr = args as string;
                if (argsStr.includes('windowId=') && argsStr.includes(',')) {
                    // Parse comma-separated format: "windowId=app-3,x=10,y=50,width=530"
                    const pairs = argsStr.split(',');
                    const params: Record<string, any> = {};
                    
                    pairs.forEach(pair => {
                        const [key, value] = pair.split('=');
                        if (key && value) {
                            const trimmedKey = key.trim();
                            const trimmedValue = value.trim();
                            // Convert numbers
                            if (!isNaN(Number(trimmedValue))) {
                                params[trimmedKey] = Number(trimmedValue);
                            } else {
                                params[trimmedKey] = trimmedValue;
                            }
                        }
                    });
                    
                    windowId = params.windowId;
                    x = params.x;
                    y = params.y;
                    width = params.width;
                    height = params.height;
                    logger.info(`[CanvasEngine] Parsed comma-separated args - windowId: "${windowId}", x: ${x}, y: ${y}, width: ${width}, height: ${height}`);
                } else {
                    // Not valid JSON and not comma-separated, treat as plain windowId string
                    windowId = argsStr;
                    logger.info(`[CanvasEngine] Args received as non-JSON string (windowId): "${windowId}"`);
                }
            }
        } else if (typeof args === 'object' && args !== null) {
            const rawArgs = args as any;
            // Try multiple field names that Gemini might use
            windowId = args.windowId || rawArgs.input || rawArgs.id;
            x = args.x || rawArgs.x;
            y = args.y || rawArgs.y; 
            width = args.width || rawArgs.width;
            height = args.height || rawArgs.height;
            
            logger.info(`[CanvasEngine] Args received as object - windowId: "${args.windowId}", input: "${rawArgs.input}", final windowId: "${windowId}"`);
            logger.info(`[CanvasEngine] Extracted parameters - x: ${x}, y: ${y}, width: ${width}, height: ${height}`);
        }
        
        if (!windowId) {
            logger.error(`[CanvasEngine] No valid windowId found in args: ${JSON.stringify(args)}`);
            return { id: 'unknown', status: 'missing_id' };
        }

        // Log whether we're using provided parameters or not
        if (x !== undefined || y !== undefined || width !== undefined || height !== undefined) {
            logger.info(`[CanvasEngine] Using provided parameters: x=${x}, y=${y}, width=${width}, height=${height}`);
        } else {
            logger.info(`[CanvasEngine] No resize parameters provided - window will remain unchanged`);
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
     * Main entry point for processing user requests
     */
    async invoke(userInput: string): Promise<string> {
        logger.info(`[CanvasEngine] Processing user input: "${userInput}"`);
        
        try {
            const config = { configurable: { thread_id: this.threadId } };
            const result = await this.graph.invoke(
                { messages: [new HumanMessage(userInput)] },
                config
            );
            
            logger.info(`[CanvasEngine] Completed processing. Windows: ${this.canvasState.windows.length}`);
            
            // Return the LLM's final response instead of generating custom summaries
            const lastMessage = result.messages[result.messages.length - 1];
            if (lastMessage && lastMessage.content) {
                return lastMessage.content;
            }
            
            return "Task completed.";
        } catch (error: any) {
            logger.error(`[CanvasEngine] Error processing user input:`, error);
            return `❌ Error: ${error.message}. Please try again with a simpler command.`;
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
     * Update the API key after initialization
     */
    updateApiKey(apiKey: string): boolean {
        if (!apiKey || apiKey.trim().length === 0) {
            logger.error('[CanvasEngine] Cannot update with empty API key');
            return false;
        }

        const trimmedKey = apiKey.trim();
        
        // Basic API key validation
        if (!trimmedKey.startsWith('AIza')) {
            logger.warn('[CanvasEngine] API key does not look like a valid Google AI key (should start with AIza)');
        }
        
        // Update the LLM config
        this.llmConfig.apiKey = trimmedKey;
        
        logger.info(`[CanvasEngine] API key updated successfully: ${trimmedKey.substring(0, 8)}...${trimmedKey.substring(trimmedKey.length - 4)}`);
        return true;
    }

    /**
     * Check if the engine has a valid API key
     */
    hasValidApiKey(): boolean {
        return !!(this.llmConfig.apiKey && this.llmConfig.apiKey.length > 0);
    }

    /**
     * Cleanup method to call when destroying the engine
     * 
     * PHASE 1: Enhanced cleanup with platform component handling
     * PHASE 2: WindowTracker cleanup
     * PHASE 3: Event listener cleanup and resource disposal
     */
    destroy(): void {
        // PHASE 1: Clean up all tracked windows (including platform components)
        this.openWindows.forEach((window, windowId) => {
            if (!window.isDestroyed()) {
                // Remove all our event listeners before closing
                window.removeAllListeners('move');
                window.removeAllListeners('resize');
                window.removeAllListeners('closed');
                
                // Only close browser windows, not platform components
                const windowState = this.canvasState.windows.find(w => w.id === windowId);
                if (windowState?.type === 'browser') {
                    window.close();
                }
            }
        });
        
        this.openWindows.clear();
        this.canvasState.windows = [];
        this.platformInstances.clear();
        
        // PHASE 3 TODO: Remove EventEmitter listeners
        // this.removeAllListeners();
        
        logger.info('[CanvasEngine] Engine destroyed and all resources cleaned up');
    }
}