/**
 * Agent Bridge - Focused on AI agent coordination
 * Handles agent lifecycle and chat communication
 * 
 * Note: This replaces the monolithic AthenaBridge with a focused service
 */

import { ConversationUpdate, ToolStatusFormatter } from '@core/agent/types/tool-status';
import logger from '@utils/logger';
import { ipcMain } from 'electron';
import { AthenaAgent } from '../../agent/athena-agent';
import { config } from '../../infrastructure/config/configuration-manager';
import { getWindowRegistry } from '../windows/window-registry';

/**
 * Streaming throttler to make the output smoother and more magical
 */
class StreamingThrottler {
    private queue: Array<{ content: string, type: 'chunk' | 'tool-call' }> = [];
    private isProcessing = false;
    private onChunk: (content: string, type: 'chunk' | 'tool-call') => void;
    
    // Configuration for magical streaming experience (configurable speeds)
    private readonly speedSettings = {
        fast: { CHUNK_DELAY_MS: 10, CHAR_DELAY_MS: 5 },
        normal: { CHUNK_DELAY_MS: 25, CHAR_DELAY_MS: 15 },
        slow: { CHUNK_DELAY_MS: 50, CHAR_DELAY_MS: 30 }
    };
    
    private settings: typeof this.speedSettings.normal;
    
    constructor(onChunk: (content: string, type: 'chunk' | 'tool-call') => void, speed: 'fast' | 'normal' | 'slow' = 'normal') {
        this.onChunk = onChunk;
        this.settings = this.speedSettings[speed];
    }
    
    /**
     * Add content to the streaming queue
     */
    enqueue(content: string, type: 'chunk' | 'tool-call' = 'chunk'): void {
        if (type === 'tool-call') {
            // Tool calls are sent immediately for proper timing
            this.queue.push({ content, type });
        } else {
            // For text content, add each character individually for smooth streaming
            for (const char of content) {
                this.queue.push({ content: char, type });
            }
        }
        
        this.processQueue();
    }
    
    /**
     * Process the queue with smooth timing
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            
            if (item.type === 'tool-call') {
                // Send tool calls immediately
                this.onChunk(item.content, item.type);
                // Small delay after tool calls for natural pacing
                await this.delay(this.settings.CHUNK_DELAY_MS * 2);
            } else {
                // Send individual characters with smooth timing
                this.onChunk(item.content, item.type);
                await this.delay(this.settings.CHAR_DELAY_MS);
            }
        }
        
        this.isProcessing = false;
    }
    
    /**
     * Utility delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Check if queue is empty and processing is complete
     */
    isComplete(): boolean {
        return this.queue.length === 0 && !this.isProcessing;
    }
    
    /**
     * Wait for all queued content to be processed
     */
    async flush(): Promise<void> {
        while (!this.isComplete()) {
            await this.delay(10);
        }
    }
}

export class AgentBridge {
    private athenaAgent: AthenaAgent | null = null;
    private initialized = false;
    private athenaWidgetWindow: any = null;
    private statusHandler: ConversationStatusHandler;
    
    constructor() {
        this.statusHandler = new ConversationStatusHandler();
        this.setupAgentIPCHandlers();
        this.setupConfigurationHandlers();
        logger.info('[AgentBridge] Agent-focused bridge initialized');
    }
    
    /**
     * Initialize Athena Agent
     */
    async initialize(): Promise<void> {
        try {
            // Create Athena Agent (it will handle configuration automatically)
            // Create agent with tool status callback
            this.athenaAgent = new AthenaAgent('desktop', {
                statusCallback: (update) => {
                    // Send tool status update to UI using status handler
                    this.statusHandler.sendUpdate({
                        type: 'tool-status',
                        content: update.toolName,
                        status: update.status,
                        timestamp: update.timestamp
                    });
                    
                    // Only log errors, not every status update
                    if (update.status === 'error') {
                        logger.warn(`[AgentBridge] Tool ${update.toolName} failed: ${update.metadata?.error}`);
                    }
                }
            });
            
            // Initialize the agent
            await this.athenaAgent.initialize();
            
            this.initialized = true;
            logger.info('[AgentBridge] Athena Agent fully initialized');
            
            // Monitor canvas changes
            this.athenaAgent.monitorCanvas((canvas) => {
                this.notifyCanvasChange(canvas);
            });
            
        } catch (error) {
            logger.error('[AgentBridge] Failed to initialize Athena:', error);
            // Don't throw - allow limited mode operation
        }
    }
    
    /**
     * Set up IPC handlers specifically for agent communication
     */
    private setupAgentIPCHandlers(): void {
        // Main Athena chat handler
        ipcMain.handle('athena:chat', async (event, message: string) => {
            logger.info(`[AgentBridge] Received chat: "${message}"`);
            
            if (!this.athenaAgent) {
                return {
                    success: false,
                    response: "⚠️ Athena is not initialized. Please check your configuration.",
                    needsApiKey: true
                };
            }
            
            if (!this.athenaAgent.hasValidConfiguration()) {
                const providerInfo = this.athenaAgent.getProviderInfo();
                return {
                    success: false,
                    response: `⚠️ Invalid configuration for ${providerInfo.service}. Please check your settings.`,
                    needsApiKey: providerInfo.service !== 'ollama'
                };
            }
            
            try {
                const response = await this.athenaAgent.invoke(message);
                return {
                    success: true,
                    response,
                    needsApiKey: false
                };
            } catch (error: any) {
                logger.error('[AgentBridge] Chat error:', error);
                return {
                    success: false,
                    response: `❌ Error: ${error.message}`,
                    needsApiKey: false
                };
            }
        });
        
        // Get canvas state
        ipcMain.handle('athena:canvas-state', async (event) => {
            if (!this.athenaAgent) {
                return { error: "Athena not initialized" };
            }
            
            try {
                return await this.athenaAgent.getCanvasState();
            } catch (error: any) {
                logger.error('[AgentBridge] Canvas state error:', error);
                return { error: error.message };
            }
        });
        
        // Clear conversation history
        ipcMain.handle('athena:clear-history', async (event) => {
            if (this.athenaAgent) {
                this.athenaAgent.clearHistory();
                logger.info('[AgentBridge] Conversation history cleared');
            }
            return { success: true };
        });
        
        // Get provider status including connection status
        ipcMain.handle('athena:provider-status', async (event) => {
            if (!this.athenaAgent) {
                return {
                    initialized: false,
                    ready: false,
                    provider: 'unknown',
                    model: 'unknown',
                    hasValidConfig: false,
                    connectionStatus: 'unknown'
                };
            }
            
            const providerInfo = this.athenaAgent.getProviderInfo();
            
            return {
                initialized: this.initialized,
                ready: this.athenaAgent.isReady(),
                provider: providerInfo.service,
                model: providerInfo.model,
                hasValidConfig: this.athenaAgent.hasValidConfiguration(),
                canvasType: this.athenaAgent.getCanvasType(),
                connectionStatus: this.athenaAgent.getConnectionStatus()
            };
        });
        
        // Direct agent communication handlers
        ipcMain.on('run-agent', async (event, userInput: string) => {
            logger.info(`[AgentBridge] Processing run-agent request: "${userInput}"`);
            
            if (!this.athenaAgent) {
                const errorMsg = "⚠️ Athena is not initialized. Please check your configuration.";
                logger.warn('[AgentBridge] ' + errorMsg);
                
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('agent-response', errorMsg);
                }
                return;
            }

            // Force reload configuration before validation to ensure fresh data
            await this.athenaAgent.reloadConfigurationManually();
            
            // Check if agent has valid configuration before proceeding (using async version to check actual API keys)
            if (!(await this.athenaAgent.hasValidConfigurationAsync())) {
                const providerInfo = this.athenaAgent.getProviderInfo();
                const errorMsg = providerInfo.service === 'ollama'
                    ? "⚠️ Invalid Ollama configuration. Please check your model settings."
                    : "⚠️ API key not found. Please set up your API key in settings.";
                
                logger.warn(`[AgentBridge] ${errorMsg}`);
                
                // Send user message first
                this.statusHandler.sendUpdate({
                    type: 'user',
                    content: userInput
                });

                // Send streaming start signal
                this.statusHandler.sendUpdate({
                    type: 'agent-stream-start',
                    content: ''
                });

                // Send error message through streaming system
                const streamHandler = this.createStreamHandler();
                streamHandler.sendChunk(errorMsg);
                await streamHandler.finish();

                // Send streaming end signal
                this.statusHandler.sendUpdate({
                    type: 'agent-stream-end',
                    content: ''
                });
                
                return;
            }

            try {
                // Send user message to conversation monitors
                this.statusHandler.sendUpdate({
                    type: 'user',
                    content: userInput
                });

                // Send streaming start signal
                this.statusHandler.sendUpdate({
                    type: 'agent-stream-start',
                    content: ''
                });

                let fullResponse = '';
                let streamingChunkCount = 0;
                const logStreamingEvery = 50;
                
                // Create smooth streaming handler based on configuration
                const streamHandler = this.createStreamHandler();
                
                // Use streaming invoke with enhanced chunk callback
                fullResponse = await this.athenaAgent.streamInvoke(userInput, (chunk: string) => {
                    streamingChunkCount++;
                    
                    // Handle tool status messages
                    if (ToolStatusFormatter.isStatusMessage(chunk)) {
                        const statusUpdate = ToolStatusFormatter.parseStatusMessage(chunk);
                        if (statusUpdate) {
                            this.statusHandler.sendUpdate({
                                type: 'tool-status',
                                content: statusUpdate.toolName,
                                status: statusUpdate.status,
                                timestamp: statusUpdate.timestamp
                            });
                            logger.debug(`[AgentBridge] Tool status update sent: ${statusUpdate.toolName} - ${statusUpdate.status}`);
                            return;
                        }
                    }
                    
                    // Handle tool call indicators
                    if (chunk.startsWith('🔧 ')) {
                        const toolName = chunk.substring(3);
                        streamHandler.sendToolCall(toolName);
                        logger.debug(`[AgentBridge] Tool call sent: ${toolName}`);
                        return;
                    }
                    
                    // Send regular streaming chunk
                    streamHandler.sendChunk(chunk);
                    
                    // Log progress occasionally
                    if (streamingChunkCount === 1 || streamingChunkCount % logStreamingEvery === 0) {
                        logger.debug(`[AgentBridge] Streaming chunk ${streamingChunkCount} processed`);
                    }
                });

                // Finalize streaming
                await streamHandler.finish();

                // Send streaming end signal
                this.statusHandler.sendUpdate({
                    type: 'agent-stream-end',
                    content: ''
                });

                logger.info(`[AgentBridge] Streaming completed with ${streamingChunkCount} chunks processed`);

            } catch (error: any) {
                logger.error('[AgentBridge] Error processing agent request:', error);
                
                this.statusHandler.sendUpdate({
                    type: 'agent-stream-error',
                    content: `❌ Error: ${error.message}`
                });
            }
        });
        
        logger.info('[AgentBridge] Agent IPC handlers set up');
    }
    
    /**
     * Set up configuration change handlers for agent auto-updates
     */
    private setupConfigurationHandlers(): void {
        config.onChange(async (newConfig) => {
            logger.info('[AgentBridge] Configuration changed, Athena will auto-update...');
            
            // The new Athena Agent automatically handles configuration changes
            // via the ConfigurableComponent base class, so we don't need to do anything here
            
            // However, if Athena isn't initialized yet and we now have valid config, initialize it
            if (!this.athenaAgent && config.hasValidProvider()) {
                try {
                    await this.initialize();
                    logger.info('[AgentBridge] Athena initialized after configuration update');
                } catch (error) {
                    logger.error('[AgentBridge] Failed to initialize Athena after config update:', error);
                }
            }
        });
    }
    
    /**
     * Notify UI about canvas changes
     */
    private notifyCanvasChange(canvas: any): void {
        // Send canvas state to all renderer processes
        // This maintains compatibility with existing UI that expects canvas updates
        const webContents = require('electron').webContents;
        
        webContents.getAllWebContents().forEach((contents: any) => {
            if (!contents.isDestroyed()) {
                contents.send('canvas-state-changed', canvas);
            }
        });
    }
    
    /**
     * Check if Athena is ready
     */
    isReady(): boolean {
        return this.initialized && !!this.athenaAgent && this.athenaAgent.isReady();
    }
    
    /**
     * Get Athena provider info including connection status
     */
    getProviderInfo(): any {
        if (!this.athenaAgent) {
            return {
                service: 'unknown',
                model: 'unknown',
                ready: false,
                connectionStatus: 'unknown'
            };
        }
        
        const providerInfo = this.athenaAgent.getProviderInfo();
        return {
            ...providerInfo,
            connectionStatus: this.athenaAgent.getConnectionStatus()
        };
    }
    
    /**
     * Graceful shutdown
     */
    async destroy(): Promise<void> {
        if (this.athenaAgent) {
            await this.athenaAgent.destroy();
            this.athenaAgent = null;
        }
        
        this.initialized = false;
        logger.info('[AgentBridge] Agent bridge destroyed');
    }

    /**
     * Send a greeting message to conversation monitors using the same streaming pattern as real agent responses
     */
    async sendGreetingMessage(): Promise<void> {
        const greetingContent = 'How can I help you today?';
        
        // Send streaming start signal (matches real agent behavior)
        this.statusHandler.sendUpdate({
            type: 'agent-stream-start',
            content: ''
        });
        
        // Use the same stream handler system as real agent responses
        const streamHandler = this.createStreamHandler();
        
        // Send the greeting content through the stream handler (with a small delay to simulate typing)
        setTimeout(async () => {
            streamHandler.sendChunk(greetingContent);
            
            // Finalize streaming (handles smooth streaming if enabled)
            await streamHandler.finish();
            
            // Send streaming end signal (matches real agent behavior)
            this.statusHandler.sendUpdate({
                type: 'agent-stream-end',
                content: ''
            });
            
        }, 200); // Small delay to simulate natural agent response time
        
        logger.info('[AgentBridge] Greeting message sent to conversation monitors using real streaming pattern');
    }
    
    /**
     * Create appropriate stream handler based on configuration
     */
    private createStreamHandler(): StreamHandler {
        const uiConfig = config.get().ui;
        
        if (uiConfig.enableSmoothStreaming) {
            return new SmoothStreamHandler(this.statusHandler, uiConfig.streamingSpeed);
        } else {
            return new DirectStreamHandler(this.statusHandler);
        }
    }
}

/**
 * Stream handler interface for easy swapping
 */
interface StreamHandler {
    sendChunk(content: string): void;
    sendToolCall(toolName: string): void;
    finish(): Promise<void>;
}

/**
 * Direct streaming - original behavior
 */
class DirectStreamHandler implements StreamHandler {
    constructor(private statusHandler: ConversationStatusHandler) {}
    
    sendChunk(content: string): void {
        this.statusHandler.sendUpdate({
            type: 'agent-stream',
            content: content
        });
    }
    
    sendToolCall(toolName: string): void {
        this.statusHandler.sendUpdate({
            type: 'tool-call',
            content: toolName
        });
    }
    
    async finish(): Promise<void> {
        // Nothing to wait for in direct mode
    }
}

/**
 * Smooth streaming - enhanced behavior
 */
class SmoothStreamHandler implements StreamHandler {
    private throttler: StreamingThrottler;
    
    constructor(private statusHandler: ConversationStatusHandler, speed: 'fast' | 'normal' | 'slow' = 'normal') {
        this.throttler = new StreamingThrottler((content: string, type: 'chunk' | 'tool-call') => {
            if (type === 'tool-call') {
                this.statusHandler.sendUpdate({
                    type: 'tool-call',
                    content: content
                });
            } else {
                this.statusHandler.sendUpdate({
                    type: 'agent-stream',
                    content: content
                });
            }
        }, speed);
    }
    
    sendChunk(content: string): void {
        this.throttler.enqueue(content, 'chunk');
    }
    
    sendToolCall(toolName: string): void {
        this.throttler.enqueue(toolName, 'tool-call');
    }
    
    async finish(): Promise<void> {
        await this.throttler.flush();
    }
}

/**
 * Separate class for handling conversation status updates
 * Follows Single Responsibility Principle
 */
class ConversationStatusHandler {
    sendUpdate(update: ConversationUpdate): void {
        try {
            const windowRegistry = getWindowRegistry();
            
            // Send to all windows with conversation-monitor capability
            const sentCount = windowRegistry.sendToWindowsWithCapability(
                'conversation-monitor', 
                'conversation-update', 
                update
            );
            
            if (sentCount === 0) {
                logger.warn('[ConversationStatusHandler] No conversation monitor windows found');
            } else {
                // Only log important conversation updates, not streaming chunks
                if (update.type !== 'agent-stream') {
                    logger.info(`[ConversationStatusHandler] Sent conversation update (${update.type}) to ${sentCount} monitor(s)`);
                }
            }
        } catch (error) {
            logger.warn('[ConversationStatusHandler] Failed to send conversation update:', error);
        }
    }
}

// Singleton instance
let agentBridge: AgentBridge | null = null;

/**
 * Get the singleton Agent Bridge instance
 */
export function getAgentBridge(): AgentBridge {
    if (!agentBridge) {
        agentBridge = new AgentBridge();
    }
    return agentBridge;
}

/**
 * Initialize Agent Bridge
 */
export async function initializeAgentBridge(): Promise<AgentBridge> {
    const bridge = getAgentBridge();
    await bridge.initialize();
    return bridge;
}

/**
 * Destroy Agent Bridge
 */
export async function destroyAgentBridge(): Promise<void> {
    if (agentBridge) {
        await agentBridge.destroy();
        agentBridge = null;
    }
} 