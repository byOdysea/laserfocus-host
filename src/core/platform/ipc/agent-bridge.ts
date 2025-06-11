/**
 * Agent Bridge - Focused on AI agent coordination
 * Handles agent lifecycle and chat communication
 * 
 * Note: This replaces the monolithic AthenaBridge with a focused service
 */

import { AthenaAgent } from '@/core/agent/athena-agent';
import { Canvas } from '@/lib/types/canvas';
import { ConversationUpdate } from '@core/agent/types/tool-status';
import * as logger from '@utils/logger';
import { ipcMain } from 'electron';
import { config, ConfigurationManager } from '../../infrastructure/config/configuration-manager';
import { AppModuleInstance } from '../discovery/main-process-discovery';
import { getWindowRegistry, WindowEventData, WindowEventType } from '../windows/window-registry';

/**
 * Type for the information about the current LLM provider.
 */
export interface ProviderInfo {
    service: string;
    model: string;
    ready: boolean;
    mcpServers?: string[];
    lastError?: string;
}

export class AgentBridge {
    private athenaAgent: AthenaAgent | null = null;
    private initialized = false;
    private athenaWidgetWindow: AppModuleInstance | null = null;
    private statusHandler: ConversationStatusHandler;
    private greetingMessageSent = false; // Flag to ensure greeting is sent only once
    
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
                const errorMsg = "⚠️ Athena is not initialized. Please check your configuration.";
                logger.warn('[AgentBridge] ' + errorMsg);

                // Send error to both InputPill and AthenaWidget
                this.broadcastConversationUpdate({
                    type: 'agent-stream-error',
                    content: errorMsg,
                    timestamp: new Date().toISOString()
                });

                return {
                    success: false,
                    response: errorMsg,
                    needsApiKey: true
                };
            }

            if (!(await this.athenaAgent.hasValidConfigurationAsync())) {
                const providerInfo = this.athenaAgent.getProviderInfo();
                const errorMsg = `⚠️ Invalid configuration for ${providerInfo.service}. Please check your settings.`;

                this.broadcastConversationUpdate({
                    type: 'agent-stream-error',
                    content: errorMsg,
                    timestamp: new Date().toISOString()
                });

                return {
                    success: false,
                    response: errorMsg,
                    needsApiKey: providerInfo.service !== 'ollama'
                };
            }

            try {
                // Send user message to AthenaWidget
                this.broadcastConversationUpdate({
                    type: 'user',
                    content: message,
                    timestamp: new Date().toISOString()
                });

                // Send thinking status
                this.broadcastConversationUpdate({
                    type: 'agent-thinking',
                    content: 'Thinking...'
                });

                // The agent will now send 'agent-stream-start' at the appropriate time.
                const response = await this.athenaAgent.invoke(
                    message,
                    (chunk) => this.broadcastConversationUpdate({
                        type: 'agent-stream',
                        content: chunk,
                        timestamp: new Date().toISOString()
                    }),
                    (update) => {
                        // The bridge is the gatekeeper for what the UI sees
                        if (update.type === 'tool-call') {
                            const config = ConfigurationManager.getInstance().get();
                            if (config.ui?.enableToolPills) {
                                this.broadcastConversationUpdate(update);
                            }
                        } else {
                            // For all other events, broadcast them directly
                            this.broadcastConversationUpdate(update);
                        }
                    }
                );

                // Send completion marker
                this.broadcastConversationUpdate({
                    type: 'agent-stream-end',
                    content: '',
                    timestamp: new Date().toISOString()
                });

                return {
                    success: true,
                    response
                };
            } catch (error) {
                logger.error('[AgentBridge] Error processing chat:', error);
                
                const errorMsg = error instanceof Error ? error.message : 'An error occurred while processing your request.';
                
                // Send error to both InputPill and AthenaWidget
                this.broadcastConversationUpdate({
                    type: 'agent-stream-error',
                    content: errorMsg,
                    timestamp: new Date().toISOString()
                });
                
                return {
                    success: false,
                    response: errorMsg
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
     * Notify the renderer process that the canvas has changed
     */
    private notifyCanvasChange(canvas: Canvas): void {
        const windowRegistry = getWindowRegistry();
        const athenaWindowInfo = windowRegistry.getWindowByComponent('AthenaWidget');
        
        if (athenaWindowInfo && athenaWindowInfo.window && !athenaWindowInfo.window.isDestroyed()) {
            athenaWindowInfo.window.webContents.send('athena:canvas-update', canvas);
            logger.debug(`[AgentBridge] Sent canvas update to Athena widget`);
        } else {
            logger.warn(`[AgentBridge] Athena widget window not found or not ready, cannot send canvas update.`);
        }
    }
    
    /**
     * Check if Athena is ready
     */
    isReady(): boolean {
        if (!this.athenaAgent) return false;
        return this.athenaAgent.isReady();
    }
    
    /**
     * Get Athena provider info including connection status
     */
    getProviderInfo(): ProviderInfo {
        if (!this.athenaAgent) {
            return {
                service: 'unknown',
                model: 'unknown',
                ready: false
            };
        }
        return this.athenaAgent.getProviderInfo();
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
        if (this.greetingMessageSent) {
            logger.info('[AgentBridge] Greeting message already sent, skipping.');
            return;
        }

        const windowRegistry = getWindowRegistry();
        const monitors = windowRegistry.getWindowsByCapability('conversation-monitor');

        const sendActualGreeting = () => {
            if (this.greetingMessageSent) return; // Double check

            const greetingContent = 'How can I help you today?';
            const greetingUpdate: ConversationUpdate = {
                type: 'agent',
                content: greetingContent,
                timestamp: new Date().toISOString()
            };
            this.statusHandler.sendUpdate(greetingUpdate);
            this.greetingMessageSent = true;
            logger.info('[AgentBridge] Greeting message sent to conversation monitor(s).');
        };

        if (monitors.length > 0) {
            logger.info('[AgentBridge] Conversation monitor found, sending greeting immediately.');
            sendActualGreeting();
        } else {
            logger.info('[AgentBridge] No conversation monitor found. Waiting for one to register...');
            
            const onMonitorRegistered = (eventData: WindowEventData) => {
                if (eventData.windowInfo.capabilities.includes('conversation-monitor')) {
                    if (!this.greetingMessageSent) {
                        logger.info(`[AgentBridge] Conversation monitor '${eventData.windowInfo.id}' registered. Sending greeting.`);
                        sendActualGreeting();
                    }
                    // Important: Unsubscribe after sending or if already sent to avoid multiple triggers/leaks
                    windowRegistry.off('window-registered', onMonitorRegistered);
                }
            };
            
            windowRegistry.on('window-registered', onMonitorRegistered);
        }
    }

    private broadcastConversationUpdate(update: ConversationUpdate): void {
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