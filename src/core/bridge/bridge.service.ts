// src/core/bridge/bridge.service.ts
import { ipcMain } from 'electron'; // Import ipcMain directly
import * as logger from '../../utils/logger';
import { CanvasEngine } from '../engine/canvas-engine';
// We no longer import specific app types here for the initializeBridge signature
import { AppIpcModule, AppMainProcessInstances } from './types'; // Import the new types
import { registerMainProcessEventHandlers } from './main-handlers'; // This will also need to change or its role will diminish

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
    try {
        // 1. Register Core/Global IPC Handlers (if any remain in main-handlers.ts)
        // For now, let's assume run-agent might still be somewhat central,
        // but its way of communicating back to apps will need to be generic
        // or CanvasEngine itself handles state updates that apps react to.
        // We'll need to adjust what registerMainProcessEventHandlers takes or does.
        // For this step, let's simplify and assume it handles only truly global things
        // or is refactored to take more generic parameters.
        // A more advanced step would be to make 'run-agent' part of CanvasEngine's own IPC module.

        // TEMPORARY: We'll need to refactor main-handlers.ts significantly.
        // For now, let's pass what it used to expect, but acknowledge this is a transition.
        // This part will be refined once we move app-specific logic out of main-handlers.ts
        const inputPillInstance = appInstances.get('inputPill');
        const athenaWidgetInstance = appInstances.get('athenaWidget');
        
        registerMainProcessEventHandlers(
            canvasEngine,
            inputPillInstance, // This direct passing will be removed/refactored
            athenaWidgetInstance // This direct passing will be removed/refactored
        );
        logger.info('[BridgeService] Core global event handlers (if any) registered.');

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
