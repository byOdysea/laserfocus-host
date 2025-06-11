/**
 * Athena Agent
 * 
 * Standalone conversational agent that uses Canvas Engine tools
 * Enhanced with modern OOP design patterns for better maintainability
 * Supports multiple LLM providers with hot configuration reloading
 */

import { Canvas } from '@/lib/types/canvas';
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import logger from '@utils/logger';
import { createHash } from 'crypto';
import { CanvasEngine } from '../canvas/canvas-engine';
import { apiKeyManager } from "../infrastructure/config/api-key-manager";
import { DEFAULT_MODEL_NAME, ProviderConfig } from '../infrastructure/config/config';
import { ConfigurableComponent } from '../infrastructure/config/configurable-component';
import { ConfigurationManager } from "../infrastructure/config/configuration-manager";
import { LLMProviderFactory } from '../integrations/llm/providers/llm-provider-factory';
import { MCPManager } from '../integrations/mcp/mcp-manager';
import { getCanvasStateParser } from './prompts/canvas-state-parser';
import { buildCoreSystemPrompt, buildMCPSummary } from "./prompts/core-system";
import { buildPlatformComponentsDescription } from "./prompts/layout-calculations";
import { buildUIComponentsSummary } from "./prompts/ui-components";
import { ToolStatusCallback, ConversationUpdate } from './types/tool-status';

// Exported types for agent status
export type AgentConnectionStatus = 'unknown' | 'connected' | 'failed' | 'no-key' | 'local' | 'disabled' | 'configured' | 'error' | 'disconnected'; // Added 'disabled', 'configured', 'error', 'disconnected' to cover all known states

export interface AgentStatusInfo {
    initialized: boolean;
    ready: boolean;
    provider: string;
    model: string;
    hasValidConfig: boolean;
    connectionStatus: AgentConnectionStatus;
    lastError?: string;
    activeTools?: string[];
    mcpServers?: string[];
}

/**
 * Dependency injection interface for Athena Agent
 */
interface AthenaAgentDependencies {
    canvasEngine?: CanvasEngine;
    llmFactory?: typeof LLMProviderFactory;
    systemPromptBuilder?: SystemPromptBuilder;
    statusCallback?: ToolStatusCallback;
    mcpManager?: MCPManager;
}

/**
 * Interface for system prompt building strategy
 */
interface SystemPromptBuilder {
    buildPrompt(canvas: Canvas, providerConfig: ProviderConfig, threadId?: string): Promise<string>;
}

/**
 * Interface for LLM workflow management
 */
interface WorkflowManager {
    createWorkflow(llm: BaseChatModel, tools: DynamicStructuredTool[], statusCallback?: ToolStatusCallback): any;
    processMessage(workflow: any, message: string, config: any, onUpdate?: (update: ConversationUpdate) => void): Promise<string>;
    streamMessage(workflow: any, message: string, config: any, onChunk: (chunk: string) => void, onUpdate?: (update: ConversationUpdate) => void): Promise<string>;
    getMetricsSnapshot(): any;
}

export class AthenaAgent extends ConfigurableComponent<ProviderConfig> {
    private llm: BaseChatModel | null = null;
    private workflow: any = null;
    private threadId: string = `athena-${Date.now()}`;
    private initialized = false;
    private connectionStatus: 'unknown' | 'connected' | 'failed' | 'no-key' | 'local' = 'unknown';
    private mcpEventCleanup: (() => void) | null = null;
    private lastError?: string; // Simple error tracking
    
    // Tool cache for preventing unnecessary LLM recreation
    private lastToolsHash: string | null = null;
    
    // Configuration cache to avoid redundant reloads
    private lastConfigHash: string | null = null;
    
    // Injected dependencies
    private readonly canvasEngine: CanvasEngine;
    private readonly llmFactory: typeof LLMProviderFactory;
    private readonly systemPromptBuilder: SystemPromptBuilder;
    private readonly workflowManager: WorkflowManager;
    private readonly statusCallback?: ToolStatusCallback;
    private readonly canvasType: string;
    private readonly mcpManager: MCPManager;

    constructor(canvasType: string = 'desktop', dependencies?: AthenaAgentDependencies) {
        super({
            configPath: 'provider',
            defaultConfig: {
                service: 'google' as const,
                apiKey: '',
                model: DEFAULT_MODEL_NAME,
                baseUrl: undefined,
                temperature: 0.2,
                maxTokens: 4096
            }
        });
        
        this.canvasType = canvasType;
        
        // Inject dependencies with sensible defaults for backward compatibility
        this.canvasEngine = dependencies?.canvasEngine || new CanvasEngine(canvasType);
        this.llmFactory = dependencies?.llmFactory || LLMProviderFactory;
        this.statusCallback = dependencies?.statusCallback;
        this.mcpManager = dependencies?.mcpManager || new MCPManager();
        this.systemPromptBuilder = dependencies?.systemPromptBuilder || new DefaultSystemPromptBuilder(this.mcpManager);
        this.workflowManager = new LangGraphWorkflowManager(
            this.statusCallback, 
            this.canvasEngine, 
            this.systemPromptBuilder
        );
        
        logger.info(`[Athena] Agent created with ${canvasType} canvas using enhanced architecture`);
    }

    /**
     * Initialize agent with dependency injection pattern
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.warn('[Athena] Already initialized');
            return;
        }

        try {
            await this.canvasEngine.initialize();
            
            // Initialize MCP manager
            await this.mcpManager.initialize();
            
            // Set up persistent event listeners for MCP connection changes
            this.setupMCPEventListeners();
            
            await this.reloadConfiguration();
            await this.initializeLLM();
            
            // Listen for API key changes and reinitialize LLM
            apiKeyManager.onChange((provider) => {
                const currentConfig = this.getConfig();
                if (currentConfig.service === provider) {
                    logger.info(`[Athena] API key changed for ${provider}, reinitializing LLM...`);
                    this.initializeLLM().catch(error => {
                        logger.error('[Athena] Failed to reinitialize LLM after API key change:', error);
                    });
                }
            });
            
            this.initialized = true;
            logger.info('[Athena] Agent fully initialized');
        } catch (error) {
            logger.error('[Athena] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Set up persistent event listeners for MCP connection changes
     * This ensures the agent automatically refreshes tools when MCP servers connect/disconnect
     */
    private setupMCPEventListeners(): void {
        let debounceTimer: NodeJS.Timeout | null = null;
        
        const debouncedRefresh = async (serverId: string, status: { connected: boolean; toolCount?: number; error?: string }) => {
            // Clear any existing timer
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            
            // Debounce rapid connection changes (e.g., during config updates with multiple servers)
            debounceTimer = setTimeout(async () => {
                if (this.initialized) {
                    logger.info(`[Athena] MCP server ${serverId} ${status.connected ? 'connected' : 'disconnected'} (${status.toolCount || 0} tools)`);
                    
                    try {
                        await this.refreshTools();
                        logger.debug(`[Athena] Tools refreshed after ${serverId} status change`);
                    } catch (error) {
                        logger.error(`[Athena] Failed to refresh tools after MCP server ${serverId} change:`, error);
                    }
                }
                debounceTimer = null;
            }, 500);
        };
        
        // Set up the persistent listener
        this.mcpManager.onConnectionStatusChange(debouncedRefresh);
        
        // Store cleanup function
        this.mcpEventCleanup = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            this.mcpManager.offConnectionStatusChange(debouncedRefresh);
            logger.debug('[Athena] Cleaned up MCP event listeners');
        };
        
        logger.info('[Athena] Set up persistent MCP event listeners for automatic tool refresh');
    }

    /**
     * Reload configuration from configuration manager only if changed
     */
    private async reloadConfiguration(): Promise<void> {
        try {
            const configManager = ConfigurationManager.getInstance();
            const fullConfig = configManager.get();
            const providerConfig = fullConfig.provider;
            
            if (!providerConfig) {
                logger.warn('[Athena] No provider configuration found during reload');
                return;
            }
            
            // Create a hash of the current configuration
            const configHash = this.hashConfig(providerConfig);
            
            // Check if configuration has actually changed
            if (this.lastConfigHash === configHash) {
                logger.debug('[Athena] Configuration unchanged, skipping reload');
                return;
            }
            
            // Configuration has changed
            const currentConfig = this.getConfig();
            this.config = providerConfig;
            this.lastConfigHash = configHash;
            
            logger.info(`[Athena] Configuration reloaded - API Key: ${providerConfig.apiKey ? '***' + providerConfig.apiKey.slice(-4) : 'NONE'}, Model: ${providerConfig.model}`);
            await this.initializeLLM();
        } catch (error) {
            logger.error('[Athena] Failed to reload configuration:', error);
        }
    }

    /**
     * Initialize LLM with factory pattern and proper error handling
     */
    private async initializeLLM(): Promise<void> {
        const providerConfig = this.getConfig();
        this.connectionStatus = 'unknown'; // Reset status at the beginning
        this.lastError = undefined;

        if (providerConfig.service === 'disabled') {
            logger.info('[Athena] LLM service is disabled by configuration.');
            this.llm = null;
            this.workflow = null;
            this.connectionStatus = 'local'; // Or a dedicated 'disabled' status if preferred
            this.lastError = undefined;
            this.initialized = true; // Agent is in a valid, known (non-LLM) state
            // No need to proceed with LLM-specific setup or validation
            return;
        }

        try {
            logger.info(`[Athena] Initializing LLM: ${providerConfig.service}/${providerConfig.model}`);
            
            // Validate configuration
            const errors = await this.llmFactory.validateProviderAsync(providerConfig);
            if (this.shouldFailValidation(providerConfig, errors)) {
                this.handleValidationFailure(providerConfig, errors);
                return;
            }

            // Get canvas tools
            const canvasTools = this.canvasEngine.getTools();
            const allTools = [...canvasTools, ...this.getAdditionalTools()];

            // Check if tools have changed to avoid unnecessary recreation
            const toolsHash = this.hashTools(allTools, providerConfig);
            if (this.llm && this.workflow && this.lastToolsHash === toolsHash) {
                logger.debug('[Athena] Tools and config unchanged, reusing existing LLM');
                this.connectionStatus = 'connected'; // Restore status as we are reusing a connected LLM
                this.lastError = undefined; // Clear any previous transient error
                return;
            }

            // Clean up existing LLM reference
            if (this.llm) {
                logger.debug('[Athena] Releasing previous LLM instance');
            }

            // Create LLM
            this.llm = await this.llmFactory.createLLM({
                provider: providerConfig,
                tools: allTools
            });

            // Create workflow
            if (this.llm) {
                this.workflow = this.workflowManager.createWorkflow(this.llm, allTools, this.statusCallback);
            }

            // Cache tools hash
            this.lastToolsHash = toolsHash;

            this.connectionStatus = 'connected';
            logger.info(`[Athena] LLM initialized successfully`);
        } catch (error) {
            this.handleLLMInitializationError(error);
        }
    }

    private shouldFailValidation(providerConfig: ProviderConfig, errors: string[]): boolean {
        // Fail if there are any errors and the provider is not 'disabled'
        // Allows 'disabled' provider to proceed without full validation for UI/testing purposes
        return errors.length > 0 && providerConfig.service !== 'disabled';
    }

    private handleValidationFailure(providerConfig: ProviderConfig, errors: string[]): void {
        const errorMsg = `Provider validation failed for ${providerConfig.service}: ${errors.join(', ')}`;
        logger.error(`[Athena] ${errorMsg}`);
        this.connectionStatus = 'failed'; // Changed from 'error'
        this.lastError = errorMsg;
        // Removed statusCallback call; this callback is for ToolStatusUpdate.
        // Agent initialization errors are logged and reflected in connectionStatus.
        // Throw to prevent further initialization steps if validation fails critically.
        throw new Error(errorMsg);
    }

    private handleLLMInitializationError(error: any): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('[Athena] Failed to initialize LLM:', errorMessage);
        this.connectionStatus = 'failed'; // Changed from 'error'
        this.lastError = `LLM Initialization Failed: ${errorMessage}`;
        // Removed statusCallback call; this callback is for ToolStatusUpdate.
        // Agent initialization errors are logged and reflected in connectionStatus.
        // Optionally, re-throw if this error should halt further operations or be caught upstream.
        // throw error; 
    }

    /**
     * Configuration change handler with proper error handling
     */
    protected async onConfigurationChange(newConfig: ProviderConfig, previousConfig: ProviderConfig): Promise<void> {
        logger.info(`[Athena] onConfigurationChange triggered. Old: ${previousConfig.service}/${previousConfig.model}, New: ${newConfig.service}/${newConfig.model}.`);
        
        try {
            // Delegate to reloadConfiguration, which includes a hash check and further logging.
            await this.reloadConfiguration(); 
        } catch (error) {
            logger.error(`[Athena] Error during onConfigurationChange (calling reloadConfiguration) for ${newConfig.service}/${newConfig.model}:`, error);
        }
    }

    /**
     * Get additional non-canvas tools including MCP tools
     */
    private getAdditionalTools(): DynamicStructuredTool[] {
        const additionalTools: DynamicStructuredTool[] = [];
        
        // Add MCP tools if available
        try {
            const mcpTools = this.mcpManager.getTools();
            additionalTools.push(...mcpTools);
            logger.info(`[Athena] Added ${mcpTools.length} MCP tools from ${this.mcpManager.getConnectedServers().length} servers`);
        } catch (error) {
            logger.warn('[Athena] Failed to get MCP tools:', error);
        }
        
        // Add other tools here like web search, file operations, etc.
        
        return additionalTools;
    }

    /**
     * Process user input. This method will attempt to stream the response.
     * If streaming events are available, onChunk will be called for each chunk.
     * If streaming events fail or are not available, the workflowManager.streamMessage
     * will fall back to a regular invocation, and the full response will be
     * delivered as a single call to onChunk.
     * Tool calls and other updates are sent via the onUpdate callback.
     */
    async invoke(
        userInput: string, 
        onChunk: (chunk: string) => void, // Made non-optional as streamMessage requires it
        onUpdate?: (update: ConversationUpdate) => void
    ): Promise<string> {
        logger.info(`[Athena] Processing: "${userInput}"`);
        
        if (!this.initialized || !this.workflow) {
            // If onUpdate is available, send an error update to the UI
            if (onUpdate) {
                onUpdate({
                    type: 'agent-stream-error',
                    content: this.getNotReadyMessage(),
                    timestamp: new Date().toISOString()
                });
            }
            return this.getNotReadyMessage();
        }

        try {
            const config = { configurable: { thread_id: this.threadId } };
            
            // Always use streamMessage. It handles its own fallback to non-streaming if necessary.
            const result = await this.workflowManager.streamMessage(
                this.workflow, 
                userInput, 
                config, 
                onChunk, 
                onUpdate
            );
            this.lastError = undefined; // Clear error on success
            return result;
        } catch (error: any) {
            this.lastError = error.message;
            const errorMessage = `❌ I encountered an error: ${error.message}. Please try again.`;
            logger.error(`[Athena] Error processing input:`, error);
            
            // Send error to UI via onUpdate if available
            if (onUpdate) {
                onUpdate({
                    type: 'agent-stream-error',
                    content: errorMessage,
                    timestamp: new Date().toISOString()
                });
            }
            return errorMessage;
        }
    }

    private getNotReadyMessage(): string {
        const providerInfo = this.getProviderInfo();
        if (!providerInfo.ready && providerInfo.lastError?.includes('API key')) {
            return "⚠️ Your AI provider API key is missing or invalid. Please check your settings.";
        }
        return "⚠️ Athena is not ready. Please wait a moment or check your configuration.";
    }

    /**
     * Refresh agent tools (useful when MCP servers change)
     */
    async refreshTools(): Promise<void> {
        if (this.initialized) {
            logger.debug('[Athena] Refreshing agent tools...');
            try {
                // ✅ UPDATED: ConfigurableComponent automatically handles config changes
                // Also ensure MCP manager has latest configuration via its own ConfigurableComponent
                const configManager = ConfigurationManager.getInstance();
                const fullConfig = configManager.get();
                if (fullConfig.integrations?.mcp) {
                    // MCP manager will automatically sync connections when config changes
                    // via the ConfigurableComponent's change handler
                }
                
                // Rebuild workflow with updated MCP tools
                await this.initializeLLM(); 
                
                logger.debug('[Athena] Agent tools refreshed successfully');
            } catch (error) {
                logger.error('[Athena] Failed to refresh agent tools:', error);
            }
        }
    }
    
    /**
     * Get canvas state for external inspection
     */
    async getCanvasState(): Promise<Canvas> {
        return this.canvasEngine.getCanvas();
    }
    
    /**
     * Monitor canvas changes
     */
    monitorCanvas(callback: (canvas: Canvas) => void): void {
        this.canvasEngine.monitorChanges(callback);
    }
    
    /**
     * Check if agent has valid configuration (async to properly check API keys)
     */
    async hasValidConfigurationAsync(): Promise<boolean> {
        const providerConfig = this.getConfig();
        const errors = await this.llmFactory.validateProviderAsync(providerConfig);
        
        // Ollama doesn't require API key
        if (providerConfig.service === 'ollama') {
            return !errors.some(e => e.includes('Model name'));
        }
        
        return errors.length === 0;
    }

    /**
     * Check if agent has valid configuration (sync version for backward compatibility)
     * Note: This may not reflect actual API key availability
     */
    hasValidConfiguration(): boolean {
        const providerConfig = this.getConfig();
        const errors = this.llmFactory.validateProvider(providerConfig);
        
        // Ollama doesn't require API key
        if (providerConfig.service === 'ollama') {
            return !errors.some(e => e.includes('Model name'));
        }
        
        return errors.length === 0;
    }

    // Public interface methods
    isReady(): boolean { return this.initialized && this.workflow !== null && this.connectionStatus === 'connected'; }
    getConnectionStatus() { return this.connectionStatus; }
    clearHistory(): void { this.threadId = `athena-${Date.now()}`; }
    getCanvasType(): string { return this.canvasType; }
    
    /**
     * Get current provider info including MCP status and last error
     */
    getProviderInfo(): { service: string; model: string; ready: boolean; mcpServers?: string[]; lastError?: string } {
        const config = this.getConfig();
        return {
            service: config.service,
            model: config.model,
            ready: this.isReady(),
            mcpServers: this.mcpManager.getConnectedServers(),
            lastError: this.lastError
        };
    }
    
    /**
     * Get MCP connection status
     */
    getMCPStatus(): { enabled: boolean; servers: { [serverId: string]: { connected: boolean; lastConnected?: Date; attempts: number } } } {
        try {
            const connectionStatus = this.mcpManager.getConnectionStatus();
            const fullConfig = ConfigurationManager.getInstance().get();
            const mcpEnabled = fullConfig?.integrations?.mcp?.enabled || false;
            return {
                enabled: mcpEnabled,
                servers: connectionStatus
            };
        } catch (error) {
            logger.error('[Athena] Failed to get MCP status:', error);
            return { enabled: false, servers: {} };
        }
    }

    /**
     * Get tool count by MCP server for UI display
     */
    getMCPToolCounts(): { [serverId: string]: number } {
        try {
            const tools = this.mcpManager.getTools();
            const toolsByServer: { [serverId: string]: number } = {};
            
            tools.forEach((tool) => {
                const serverId = (tool as any).metadata?.serverId || (tool as any).serverId;
                
                if (serverId) {
                    toolsByServer[serverId] = (toolsByServer[serverId] || 0) + 1;
                }
            });
            
            return toolsByServer;
        } catch (error) {
            logger.warn('[Athena] Failed to get MCP tool counts:', error);
            return {};
        }
    }
    
    async destroy(): Promise<void> {
        if (this.mcpEventCleanup) {
            this.mcpEventCleanup();
            this.mcpEventCleanup = null;
        }
        
        // Stop metrics reporting if using LangGraphWorkflowManager
        if (this.workflowManager && typeof (this.workflowManager as any).stopMetricsReporting === 'function') {
            (this.workflowManager as any).stopMetricsReporting();
        }
        
        super.destroy();
        await this.canvasEngine.destroy();
        await this.mcpManager.destroy();
        this.llm = null;
        this.workflow = null;
        this.initialized = false;
        logger.info('[Athena] Agent destroyed');
    }

    /**
     * Get performance metrics snapshot for monitoring and debugging
     */
    getPerformanceMetrics(): any {
        return this.workflowManager.getMetricsSnapshot();
    }

    /**
     * Build ultra-efficient system prompt using consolidated approach
     * Now uses centralized parsing to prevent duplication
     */
    async buildEfficientSystemPrompt(canvas: Canvas, providerConfig: ProviderConfig): Promise<string> {
        return this.systemPromptBuilder.buildPrompt(canvas, providerConfig, this.threadId);
    }

    private hashTools(tools: DynamicStructuredTool[], providerConfig: ProviderConfig): string {
        // Create lightweight hash of tool names and provider config
        const toolNames = tools.map(t => t.name).sort().join(',');
        const configKey = `${providerConfig.service}:${providerConfig.model}:${toolNames}`;
        
        // Simple fast hash function
        let hash = 0;
        for (let i = 0; i < configKey.length; i++) {
            const char = configKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }
    
    private hashConfig(config: ProviderConfig): string {
        // Create lightweight hash of config for change detection
        const configKey = `${config.service}:${config.model}:${config.apiKey || ''}:${config.baseUrl || ''}:${config.temperature}:${config.maxTokens}`;
        
        // Simple fast hash function
        let hash = 0;
        for (let i = 0; i < configKey.length; i++) {
            const char = configKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }
}

/**
 * LangGraph-specific workflow manager implementation
 */
class LangGraphWorkflowManager implements WorkflowManager {
    private threadId?: string;
    private cachedSystemPrompt?: string;
    private lastCanvasHash?: string;
    
    // Performance metrics tracking
    private readonly metrics = {
        cacheHits: 0,
        cacheMisses: 0,
        requestTimes: [] as number[],
        promptBuildTimes: [] as number[],
        canvasHashTimes: [] as number[],
        totalRequests: 0,
        lastReportTime: Date.now(),
        startTime: Date.now()
    };
    
    // Metrics reporting interval (5 minutes)
    private readonly METRICS_REPORT_INTERVAL = 5 * 60 * 1000;
    private metricsTimer?: NodeJS.Timeout;
    
    constructor(
        private statusCallback?: ToolStatusCallback,
        private canvasEngine?: CanvasEngine,
        private systemPromptBuilder?: SystemPromptBuilder
    ) {
        // Start periodic metrics reporting
        this.startMetricsReporting();
    }

    createWorkflow(llm: BaseChatModel, tools: DynamicStructuredTool[], statusCallback?: ToolStatusCallback): any {
        const toolNode = new ToolNode(tools);
        
        const shouldContinue = (state: typeof MessagesAnnotation.State) => {
            const transitionStart = performance.now();
            const lastMessage = state.messages[state.messages.length - 1];
            
            if (lastMessage instanceof AIMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                const toolNames = lastMessage.tool_calls.map(tc => tc.name).join(', ');
                const transitionTime = performance.now() - transitionStart;
                logger.debug(`[Athena] Using tools: ${toolNames} (transition: ${transitionTime.toFixed(1)}ms)`);
                return "tools";
            }
            
            const transitionTime = performance.now() - transitionStart;
            logger.debug(`[Athena] No tools needed (transition: ${transitionTime.toFixed(1)}ms)`);
            return END;
        };

        const callAgent = async (state: typeof MessagesAnnotation.State) => {
            const systemPrompt = await this.buildSystemPromptCached(llm);
            const messages = [new SystemMessage(systemPrompt), ...state.messages];
            
            try {
                const response = await llm.invoke(messages);
                return { messages: [response] };
            } catch (error: any) {
                logger.error(`[Athena] LLM invocation failed:`, error);
                const errorMessage = new AIMessage({
                    content: `I encountered an error: ${error.message}. Please try again.`
                });
                return { messages: [errorMessage] };
            }
        };

        // Enhanced tool execution with status tracking
        const enhancedToolNode = async (state: typeof MessagesAnnotation.State, runnableConfig?: RunnableConfig) => {
            const nodeStart = performance.now();
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage instanceof AIMessage && lastMessage.tool_calls) {
                const onUpdateFromConfig = runnableConfig?.configurable?.onUpdate as ((update: ConversationUpdate) => void) | undefined;

                // Send tool execution start status for each tool
                lastMessage.tool_calls.forEach((toolCall) => {
                    const setupTime = performance.now() - nodeStart;
                    logger.debug(`[Athena] Preparing tool call: ${toolCall.name} (node setup: ${setupTime.toFixed(1)}ms)`);

                    // Send 'tool-call' ConversationUpdate for tool pill via onUpdateFromConfig
                    if (onUpdateFromConfig) {
                        onUpdateFromConfig({
                            type: 'tool-call',
                            toolName: toolCall.name,
                            toolInput: toolCall.args,
                            timestamp: new Date().toISOString(),
                            message: `Executing tool: ${toolCall.name}`
                        });
                    }
                    
                    // Original statusCallback for 'executing' -
                    // Commented out to avoid duplicate UI messages as AgentBridge will handle 'tool-call'.
                    /*
                    if (statusCallback) {
                        statusCallback({
                            toolName: toolCall.name,
                            status: 'executing',
                            timestamp: new Date().toISOString(),
                            metadata: { args: toolCall.args }
                        });
                    }
                    */
                });
            }
            
            let result;
            
            try {
                const toolExecutionStart = performance.now();
                result = await toolNode.invoke(state);
                const toolExecutionTime = performance.now() - toolExecutionStart;
                logger.debug(`[Athena] Tool execution completed in ${toolExecutionTime.toFixed(1)}ms`);
                
                // Send completion status for all tools that were executed
                if (lastMessage instanceof AIMessage && lastMessage.tool_calls && statusCallback) {
                    lastMessage.tool_calls.forEach((toolCall) => {
                        statusCallback({
                            toolName: toolCall.name,
                            status: 'completed',
                            timestamp: new Date().toISOString(),
                            metadata: { completed: true, executionTime: toolExecutionTime }
                        });
                    });
                }
                
            } catch (error) {
                logger.error(`[Athena] Tool execution failed:`, error);
                
                // Send error status
                if (lastMessage instanceof AIMessage && lastMessage.tool_calls && statusCallback) {
                    lastMessage.tool_calls.forEach((toolCall) => {
                        statusCallback({
                            toolName: toolCall.name,
                            status: 'error',
                            timestamp: new Date().toISOString(),
                            metadata: { error: error instanceof Error ? error.message : String(error) }
                        });
                    });
                }
                
                // Return error message
                if (lastMessage instanceof AIMessage && lastMessage.tool_calls?.[0]) {
                    const errorMessage = new ToolMessage({
                        content: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                        tool_call_id: lastMessage.tool_calls[0].id || 'unknown'
                    });
                    result = { messages: [errorMessage] };
                }
            }
            
            return result;
        };

        const workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", callAgent)
            .addNode("tools", enhancedToolNode)
            .addEdge(START, "agent")
            .addConditionalEdges("agent", shouldContinue, {
                tools: "tools",
                [END]: END
            })
            .addEdge("tools", "agent");

        const checkpointer = new MemorySaver();
        return workflow.compile({ checkpointer });
    }

    async processMessage(
        workflow: any, 
        message: string, 
        config: any, 
        onUpdate?: (update: ConversationUpdate) => void
    ): Promise<string> {
        // Extract thread ID from config
        this.threadId = config?.configurable?.thread_id;
        
        // Track request timing
        const requestStart = performance.now();
        
        // Prepare config with onUpdate
        const invokeConfig = { 
            ...config, 
            configurable: { 
                ...config?.configurable, 
                thread_id: this.threadId, 
                onUpdate // Pass onUpdate here
            } 
        };
        
        const result = await workflow.invoke({ messages: [new HumanMessage(message)] }, invokeConfig);
        const lastMessage = result.messages[result.messages.length - 1];
        const response = lastMessage?.content || "Task completed.";
        
        // Record metrics
        const requestTime = performance.now() - requestStart;
        this.recordRequestMetrics(requestTime);
        
        logger.info(`[Athena] Response: "${response}" (${requestTime.toFixed(1)}ms)`);
        return response;
    }

    async streamMessage(
        workflow: any, 
        message: string, 
        config: any, 
        onChunk: (chunk: string) => void,
        onUpdate?: (update: ConversationUpdate) => void
    ): Promise<string> {
        // Extract thread ID from config
        this.threadId = config?.configurable?.thread_id;
        
        // Track request timing
        const requestStart = performance.now();
        
        let streamedContent = '';
        let chunkCount = 0;

        // Prepare config with onUpdate for streamEvents and fallback invoke
        const streamAndInvokeConfig = {
            ...config,
            configurable: {
                ...config?.configurable,
                thread_id: this.threadId,
                onUpdate // Pass onUpdate here
            },
            version: "v2" as const // Ensure version is correctly typed for streamEvents
        };
        
        try {
            const eventStream = workflow.streamEvents(
                { messages: [new HumanMessage(message)] },
                streamAndInvokeConfig 
            );

            let lastEventTime = performance.now();
            for await (const event of eventStream) {
                const currentTime = performance.now();
                const timeSinceLastEvent = currentTime - lastEventTime;
                
                // Log slow events (>100ms gap)
                if (timeSinceLastEvent > 100) {
                    logger.debug(`[Athena] Event stream gap: ${timeSinceLastEvent.toFixed(1)}ms before ${event.event}`);
                }
                
                // Handle any content streaming (provider-agnostic)
                if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
                    const content = event.data.chunk.content;
                    if (typeof content === 'string' && content.length > 0) {
                        streamedContent += content;
                        chunkCount++;
                        onChunk(content);
                    }
                }
                
                lastEventTime = currentTime;
            }
            
            // If we got content through streaming, return it (don't send again via onChunk)
            if (streamedContent.length > 0) {
                const requestTime = performance.now() - requestStart;
                this.recordRequestMetrics(requestTime);
                logger.info(`[Athena] Streaming successful: ${streamedContent.length} chars, ${chunkCount} chunks (${requestTime.toFixed(1)}ms)`);
                return streamedContent;
            }
        } catch (error) {
            logger.debug(`[LangGraphWorkflowManager] Streaming failed, falling back to invoke`);
        }

        // Fallback to regular invoke (only if streaming produced no content)
        try {
            const result = await workflow.invoke({ messages: [new HumanMessage(message)] }, streamAndInvokeConfig); // Use updated config
            const response = this.extractResponseContent(result);
            
            // Only send the response if we didn't already stream content
            if (response && streamedContent.length === 0) {
                onChunk(response);
                const requestTime = performance.now() - requestStart;
                this.recordRequestMetrics(requestTime);
                logger.info(`[Athena] Fallback response provided: ${response.length} characters (${requestTime.toFixed(1)}ms)`);
                return response;
            }
            
            const requestTime = performance.now() - requestStart;
            this.recordRequestMetrics(requestTime);
            return streamedContent || response || "Response completed.";
        } catch (error) {
            logger.error(`[Athena] Both streaming and invoke failed:`, error);
            throw error;
        }
    }

    private async buildSystemPromptCached(llm: BaseChatModel): Promise<string> {
        // Performance tracking
        performance.mark('prompt-cache-start');
        const promptStart = performance.now();
        
        if (this.canvasEngine && this.systemPromptBuilder) {
            const canvas = await this.canvasEngine.getCanvas();
            
            // Time canvas hash generation
            const hashStart = performance.now();
            const canvasHash = createHash('md5').update(JSON.stringify(canvas)).digest('hex');
            const hashTime = performance.now() - hashStart;
            this.metrics.canvasHashTimes.push(hashTime);
            
            // Check if we can reuse cached prompt
            if (this.cachedSystemPrompt && this.lastCanvasHash === canvasHash) {
                performance.mark('prompt-cache-hit');
                this.metrics.cacheHits++;
                const promptTime = performance.now() - promptStart;
                this.metrics.promptBuildTimes.push(promptTime);
                
                logger.debug('[Athena] Reusing cached system prompt', { 
                    cacheHit: true,
                    hashTime: `${hashTime.toFixed(2)}ms`,
                    promptTime: `${promptTime.toFixed(2)}ms`,
                    cacheHitRatio: `${(this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(1)}%`
                });
                return this.cachedSystemPrompt;
            }
            
            performance.mark('prompt-cache-miss');
            this.metrics.cacheMisses++;
            
            // Build new prompt and cache it
            const providerConfig = ConfigurationManager.getInstance().get().provider;
            const buildStart = performance.now();
            const prompt = await this.systemPromptBuilder.buildPrompt(canvas, providerConfig, this.threadId);
            const buildTime = performance.now() - buildStart;
            
            this.cachedSystemPrompt = prompt;
            this.lastCanvasHash = canvasHash;
            
            const promptTime = performance.now() - promptStart;
            this.metrics.promptBuildTimes.push(promptTime);
            
            logger.debug('[Athena] Built and cached new system prompt', { 
                cacheHit: false, 
                promptLength: prompt.length,
                canvasHash: canvasHash.slice(0, 8),
                hashTime: `${hashTime.toFixed(2)}ms`,
                buildTime: `${buildTime.toFixed(2)}ms`,
                totalTime: `${promptTime.toFixed(2)}ms`,
                cacheHitRatio: `${(this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(1)}%`
            });
            return prompt;
        }
        return "You are Athena, an AI assistant with desktop management capabilities.";
    }

    private extractResponseContent(result: any): string {
        const lastMessage = result.messages[result.messages.length - 1];
        const response = lastMessage?.content || "Task completed.";
        logger.info(`[Athena] Response: "${response}"`);
        return response;
    }

    private recordRequestMetrics(requestTime: number): void {
        this.metrics.requestTimes.push(requestTime);
        this.metrics.totalRequests++;
    }

    private startMetricsReporting(): void {
        this.metricsTimer = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.metrics.startTime;
            const totalRequests = this.metrics.totalRequests;
            const cacheHits = this.metrics.cacheHits;
            const cacheMisses = this.metrics.cacheMisses;
            const totalPromptBuildTime = this.metrics.promptBuildTimes.reduce((a, b) => a + b, 0);
            const totalCanvasHashTime = this.metrics.canvasHashTimes.reduce((a, b) => a + b, 0);
            const totalRequestTime = this.metrics.requestTimes.reduce((a, b) => a + b, 0);

            const averageRequestTime = totalRequestTime / totalRequests;
            const averagePromptBuildTime = totalPromptBuildTime / totalRequests;
            const averageCanvasHashTime = totalCanvasHashTime / totalRequests;
            const cacheHitRatio = cacheHits / (cacheHits + cacheMisses);

            logger.info(`[Athena] Workflow metrics - Total Requests: ${totalRequests}, Cache Hits: ${cacheHits}, Cache Misses: ${cacheMisses}, Cache Hit Ratio: ${cacheHitRatio.toFixed(2)}, Average Request Time: ${averageRequestTime.toFixed(2)}ms, Average Prompt Build Time: ${averagePromptBuildTime.toFixed(2)}ms, Average Canvas Hash Time: ${averageCanvasHashTime.toFixed(2)}ms`);

            // Reset metrics for next reporting period
            this.metrics.cacheHits = 0;
            this.metrics.cacheMisses = 0;
            this.metrics.requestTimes = [];
            this.metrics.promptBuildTimes = [];
            this.metrics.canvasHashTimes = [];
            this.metrics.totalRequests = 0;
            this.metrics.lastReportTime = now;
            this.metrics.startTime = now;
        }, this.METRICS_REPORT_INTERVAL);
    }

    public stopMetricsReporting(): void {
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
            this.metricsTimer = undefined;
        }
    }

    // Method to get current metrics snapshot for debugging
    public getMetricsSnapshot(): any {
        const totalRequests = this.metrics.totalRequests;
        const cacheHits = this.metrics.cacheHits;
        const cacheMisses = this.metrics.cacheMisses;
        
        return {
            totalRequests,
            cacheHits,
            cacheMisses,
            cacheHitRatio: totalRequests > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
            averageRequestTime: this.metrics.requestTimes.length > 0 
                ? this.metrics.requestTimes.reduce((a, b) => a + b, 0) / this.metrics.requestTimes.length 
                : 0,
            averagePromptBuildTime: this.metrics.promptBuildTimes.length > 0 
                ? this.metrics.promptBuildTimes.reduce((a, b) => a + b, 0) / this.metrics.promptBuildTimes.length 
                : 0,
            averageCanvasHashTime: this.metrics.canvasHashTimes.length > 0 
                ? this.metrics.canvasHashTimes.reduce((a, b) => a + b, 0) / this.metrics.canvasHashTimes.length 
                : 0,
            uptimeMs: Date.now() - this.metrics.startTime
        };
    }
}

/**
 * Default system prompt builder implementation
 */
class DefaultSystemPromptBuilder implements SystemPromptBuilder {
    constructor(private mcpManager: MCPManager) {}

    async buildPrompt(canvas: Canvas, providerConfig: ProviderConfig, threadId?: string): Promise<string> {
        const parser = getCanvasStateParser();
        const parsedState = await parser.getParsedState(canvas);

        const mcpTools = this.mcpManager.getTools();
        const mcpServers = this.mcpManager.getConnectedServers();
        
        return buildCoreSystemPrompt({
            userWindowCount: parsedState.windowCount,
            screenWidth: parsedState.workArea.width,
            screenHeight: parsedState.workArea.height,
            defaultX: parsedState.layoutCalculations.defaultX,
            defaultY: parsedState.layoutCalculations.defaultY,
            maxUsableWidth: parsedState.layoutCalculations.maxUsableWidth,
            defaultHeight: parsedState.layoutCalculations.defaultHeight,
            windowGap: parsedState.layoutCalculations.windowGap,
            platformComponents: buildPlatformComponentsDescription(parsedState.workArea, parsedState.layoutCalculations),
            userWindows: parsedState.userWindowsDescription,
            mcpSummary: buildMCPSummary(mcpTools, mcpServers),
            uiComponentsSummary: buildUIComponentsSummary()
        });
    }
} 