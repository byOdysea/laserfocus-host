// src/core/bridge/bridge.service.ts
import * as logger from '@utils/logger';
import { ipcMain } from 'electron'; // Import ipcMain directly
// We no longer import specific app types here for the initializeBridge signature
import { AppIpcModule, AppMainProcessInstances } from '@core/bridge/types'; // Import the new types
import { CanvasEngine } from '@core/engine/canvas-engine';

/**
 * Initializes the IPC bridge by registering core event handlers and
 * delegating to app-specific IPC modules for their handlers.
 *
 * @param canvasEngine - The initialized CanvasEngine instance.
 * @param appModules - An array of AppIpcModule instances, each responsible for its own IPC setup.
 * @param appInstances - A map of all initialized app main process instances.
 */
export const initializeBridge = (
    canvasEngine: CanvasEngine,
    appModules: AppIpcModule[],
    appInstances: AppMainProcessInstances
): void => {
    logger.info('[BridgeService] Initializing IPC bridge with modular app handlers...');
    
    logger.info(`[BridgeService] Using Canvas Engine`);
    
    try {
        // Register the modern 'run-agent' handler
        logger.info('[BridgeService] Canvas Engine detected - using modern IPC patterns');
        registerModernAgentHandler(canvasEngine, appInstances);

        // 2. Register App-Specific IPC Handlers
        appModules.forEach(module => {
            const appInstance = appInstances.get(module.moduleId);
            if (appInstance) {
                try {
                    logger.info(`[BridgeService] Registering IPC handlers for module: ${module.moduleId}`);
                    
                    // Special handling for AthenaWidget as conversation monitor
                    if (module.moduleId === 'AthenaWidget') {
                        const athenaModule = module as any;
                        if (athenaModule.registerHandlers && typeof athenaModule.registerHandlers === 'function') {
                            // AthenaWidget is now agnostic - no Canvas Engine dependency
                            athenaModule.registerHandlers(appInstance.window);
                        } else {
                            // Fallback to old method
                            module.registerMainProcessHandlers(
                                ipcMain,
                                canvasEngine,
                                appInstance,
                                appInstances
                            );
                        }
                    } else {
                        // Standard registration for other modules
                        module.registerMainProcessHandlers(
                            ipcMain,
                            canvasEngine,
                            appInstance,
                            appInstances
                        );
                    }
                    
                    logger.info(`[BridgeService] IPC handlers for module: ${module.moduleId} registered successfully.`);
                } catch (e) {
                    logger.error(`[BridgeService] Failed to register IPC handlers for module: ${module.moduleId}`, e);
                    // Decide if one module failing should stop the whole bridge or just log and continue
                }
            } else {
                logger.warn(`[BridgeService] No main process instance found for module ID: ${module.moduleId}. Skipping IPC handler registration for it.`);
            }
        });

        logger.info('[BridgeService] IPC bridge initialization complete (modular approach).');
    } catch (error) {
        logger.error('[BridgeService] Failed to initialize IPC bridge:', error);
        throw new Error('Failed to initialize IPC bridge. Critical functionality may be affected.');
    }
};

/**
 * Checks if a response content is empty or meaningless
 */
function isEmptyResponse(content: string): boolean {
    if (!content || content.trim().length === 0) {
        return true;
    }
    
    // Check for empty text structures like [{"type":"text","text":""}]
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed.every(item => 
                item.type === 'text' && (!item.text || item.text.trim().length === 0)
            );
        }
    } catch {
        // Not JSON, continue with string checks
    }
    
    // Check for other empty patterns
    const meaninglessPatterns = [
        /^\s*$/, // Only whitespace
        /^task completed\.?\s*$/i, // Generic completion without detail
        /^done\.?\s*$/i, // Just "done"
    ];
    
    return meaninglessPatterns.some(pattern => pattern.test(content.trim()));
}

/**
 * Registers the modern 'run-agent' handler for Canvas Engine
 */
function registerModernAgentHandler(
    canvasEngine: CanvasEngine, 
    appInstances: AppMainProcessInstances
): void {
    ipcMain.on('run-agent', async (event, query: string) => {
        logger.info(`[BridgeService] Modern run-agent handler received query: "${query}"`);
        
        const athenaWidgetInstance = appInstances.get('AthenaWidget');
        
        try {
            // Send user query to AthenaWidget for monitoring
            if (athenaWidgetInstance && athenaWidgetInstance.window && !athenaWidgetInstance.window.isDestroyed()) {
                athenaWidgetInstance.window.webContents.send('conversation-update', {
                    type: 'user',
                    content: query,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Send processing notification to InputPill (only if event has valid sender)
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('agent-processing');
            }
            
            // Use Canvas Engine's invoke method
            const result = await canvasEngine.invoke(query);
            
            // Canvas Engine now returns action summary directly as a string
            let responseContent = "Task completed successfully.";
            if (typeof result === 'string') {
                responseContent = result;
            } else if (result && typeof result === 'object') {
                // Fallback for legacy format (if any)
                if (result.messages && result.messages.length > 0) {
                    const lastMessage = result.messages[result.messages.length - 1];
                    if (lastMessage.content && typeof lastMessage.content === 'string') {
                        responseContent = lastMessage.content;
                    } else if ((lastMessage as any).tool_calls?.length > 0) {
                        const toolCallSummary = (lastMessage as any).tool_calls.map((tc: any) => 
                            `Executed: ${tc.name}`
                        ).join(', ');
                        responseContent = `Actions performed: ${toolCallSummary}`;
                    }
                } else {
                    responseContent = JSON.stringify(result);
                }
            }

            // Mark empty responses so frontend can handle them gracefully
            if (isEmptyResponse(responseContent)) {
                responseContent = "__EMPTY_RESPONSE__"; // Special marker for frontend
                logger.info('[BridgeService] Marking empty response for frontend handling');
            }
            
            // Send response back to requester (InputPill) only if event has valid sender
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('agent-response', responseContent);
            }
            
            // Send agent response to AthenaWidget for monitoring
            if (athenaWidgetInstance && athenaWidgetInstance.window && !athenaWidgetInstance.window.isDestroyed()) {
                athenaWidgetInstance.window.webContents.send('conversation-update', {
                    type: 'agent',
                    content: responseContent,
                    timestamp: new Date().toISOString()
                });
            }
            
        } catch (error: any) {
            logger.error('[BridgeService] Error in modern run-agent handler:', error);
            const errorMessage = `Error: ${error.message}`;
            
            // Send error response back to requester (InputPill) only if event has valid sender
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('agent-response', errorMessage);
            }
            
            // Send error to AthenaWidget for monitoring
            if (athenaWidgetInstance && athenaWidgetInstance.window && !athenaWidgetInstance.window.isDestroyed()) {
                athenaWidgetInstance.window.webContents.send('conversation-update', {
                    type: 'agent',
                    content: errorMessage,
                    timestamp: new Date().toISOString()
                });
            }
        }
    });
    
    logger.info('[BridgeService] Modern run-agent handler registered for Canvas Engine');
}
