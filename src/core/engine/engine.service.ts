import { DEFAULT_MODEL_NAME } from '@core/config/app-config';
import { CanvasEngine } from '@core/engine/canvas-engine';
import * as logger from '@utils/logger';
import { BrowserWindow } from 'electron';

let engineInstance: CanvasEngine | undefined;

/**
 * Initializes and returns a singleton instance of the CanvasEngine.
 */
export const initializeCanvasEngine = (
    inputPillWindow?: BrowserWindow,
    athenaWidgetWindow?: BrowserWindow
): CanvasEngine => {
    if (engineInstance) {
        logger.info('[EngineService] Returning existing CanvasEngine instance.');
        return engineInstance;
    }

    logger.info('[EngineService] Initializing new CanvasEngine instance...');
    
    try {
        engineInstance = new CanvasEngine(
            process.env.GOOGLE_API_KEY,
            DEFAULT_MODEL_NAME,
            [], // External tools - empty for now
            inputPillWindow,
            athenaWidgetWindow
        );
        
        logger.info('[EngineService] CanvasEngine instance initialized successfully.');
        return engineInstance;
    } catch (error) {
        logger.error('[EngineService] Failed to initialize CanvasEngine:', error);
        throw error;
    }
};

/**
 * Gets the current active engine instance.
 * Returns undefined if no engine has been initialized.
 */
export const getCurrentEngineInstance = (): CanvasEngine | undefined => {
    return engineInstance;
};

/**
 * Cleans up engine instances. Useful for testing or hot reloading.
 */
export const cleanupEngineInstances = (): void => {
    logger.info('[EngineService] Cleaning up engine instances...');
    if (engineInstance) {
        engineInstance.destroy();
        engineInstance = undefined;
    }
    logger.info('[EngineService] Engine instances cleaned up.');
};

// Maintain backwards compatibility with existing code
export const initializeCanvasEngineAuto = initializeCanvasEngine;
