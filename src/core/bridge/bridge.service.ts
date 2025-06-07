// src/core/bridge/bridge.service.ts
import { ipcMain } from 'electron'; // Import ipcMain directly
import * as logger from '../../utils/logger';
// We no longer import specific app types here for the initializeBridge signature
import { AnyCanvasEngine, AppIpcModule, AppMainProcessInstances } from './types'; // Import the new types

/**
 * Initializes the IPC bridge by registering core event handlers and
 * delegating to app-specific IPC modules for their handlers.
 *
 * @param canvasEngine - The initialized CanvasEngine instance (V1 or V2).
 * @param appModules - An array of AppIpcModule instances, each responsible for its own IPC setup.
 * @param appInstances - A map of all initialized app main process instances.
 */
export const initializeBridge = (
    canvasEngine: AnyCanvasEngine,
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
                    module.registerMainProcessHandlers(
                        ipcMain, // Pass Electron's ipcMain
                        canvasEngine,
                        appInstance,
                        appInstances // Pass all instances for potential cross-app communication
                    );
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
 * Registers the modern 'run-agent' handler for Canvas Engine
 */
function registerModernAgentHandler(
    canvasEngine: CanvasEngine, 
    appInstances: AppMainProcessInstances
): void {
    // Pragmatic: import at the top to avoid dynamic require issues
    const ATHENA_WIDGET_IPC_EVENTS = {
        USER_QUERY: 'ipc-main-event:athena-widget:user-query',
        AGENT_RESPONSE: 'ipc-main-event:athena-widget:agent-response',
        AGENT_ERROR: 'ipc-main-event:athena-widget:agent-error',
    };
    
    ipcMain.on('run-agent', async (event, query: string) => {
        logger.info(`[BridgeService] Modern run-agent handler received query: "${query}"`);
        
        const athenaWidgetInstance = appInstances.get('athenaWidget');
        
        try {
            // Emit user query to AthenaWidget
            if (athenaWidgetInstance) {
                logger.info(`[BridgeService] Emitting user query to AthenaWidget`);
                ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.USER_QUERY, query);
            }
            
            // Send processing notification to InputPill
            event.sender.send('agent-processing');
            
            // Use Canvas Engine's invoke method
            const result = await canvasEngine.invoke(query);
            
            // Extract response content from the result
            let responseContent = "Task completed successfully.";
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
            }
            
            // Send response back to requester and AthenaWidget
            event.sender.send('agent-response', responseContent);
            if (athenaWidgetInstance) {
                ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.AGENT_RESPONSE, responseContent);
            }
            
        } catch (error: any) {
            logger.error('[BridgeService] Error in modern run-agent handler:', error);
            const errorMessage = `Error: ${error.message}`;
            
            event.sender.send('agent-response', errorMessage);
            if (athenaWidgetInstance) {
                ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR, errorMessage);
            }
        }
    });
    
    logger.info('[BridgeService] Modern run-agent handler registered for Canvas Engine');
}
