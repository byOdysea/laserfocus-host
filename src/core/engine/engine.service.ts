import { BrowserWindow } from 'electron';
import * as logger from '../../utils/logger';
import { DEFAULT_MODEL_NAME } from '../config/app-config';
import { CanvasEngine } from './canvas-engine';
import { CanvasEngineV2 } from './canvas-engine-v2';

let engineInstance: CanvasEngine | undefined;
let engineV2Instance: CanvasEngineV2 | undefined;

// Flag to control which engine version to use
// This can be set via environment variable or configuration
const USE_ENGINE_V2 = process.env.USE_CANVAS_ENGINE_V2 === 'true' || process.env.NODE_ENV === 'development';

/**
 * Initializes and returns a singleton instance of the CanvasEngine (legacy).
 * @deprecated Use initializeCanvasEngineV2 for new implementations
 */
export const initializeCanvasEngine = (
    inputPillWindow?: BrowserWindow,
    athenaWidgetWindow?: BrowserWindow
): CanvasEngine => {
    if (engineInstance) {
        logger.info('[EngineService] Returning existing CanvasEngine (legacy) instance.');
        return engineInstance;
    }

    logger.info('[EngineService] Initializing new CanvasEngine (legacy) instance...');
    
    try {
        engineInstance = new CanvasEngine(
            process.env.GOOGLE_API_KEY,
            DEFAULT_MODEL_NAME,
            [], // External tools - empty for now
            inputPillWindow,
            athenaWidgetWindow
        );
        
        logger.info('[EngineService] CanvasEngine (legacy) instance initialized successfully.');
        return engineInstance;
    } catch (error) {
        logger.error('[EngineService] Failed to initialize CanvasEngine (legacy):', error);
        throw error;
    }
};

/**
 * Initializes and returns a singleton instance of the modern CanvasEngineV2.
 * This is the recommended engine for new implementations.
 */
export const initializeCanvasEngineV2 = (
    inputPillWindow?: BrowserWindow,
    athenaWidgetWindow?: BrowserWindow
): CanvasEngineV2 => {
    if (engineV2Instance) {
        logger.info('[EngineService] Returning existing CanvasEngine V2 instance.');
        return engineV2Instance;
    }

    logger.info('[EngineService] Initializing new CanvasEngine V2 instance...');
    
    try {
        engineV2Instance = new CanvasEngineV2(
            process.env.GOOGLE_API_KEY,
            DEFAULT_MODEL_NAME,
            [], // External tools - empty for now  
            inputPillWindow,
            athenaWidgetWindow
        );
        
        logger.info('[EngineService] CanvasEngine V2 instance initialized successfully.');
        return engineV2Instance;
    } catch (error) {
        logger.error('[EngineService] Failed to initialize CanvasEngine V2:', error);
        throw error;
    }
};

/**
 * Automatically chooses and initializes the appropriate Canvas Engine version.
 * Uses V2 by default in development, V1 for backwards compatibility in production.
 * This provides a smooth migration path.
 */
export const initializeCanvasEngineAuto = (
    inputPillWindow?: BrowserWindow,
    athenaWidgetWindow?: BrowserWindow
): CanvasEngine | CanvasEngineV2 => {
    if (USE_ENGINE_V2) {
        logger.info('[EngineService] Auto-initialization: Using Canvas Engine V2');
        return initializeCanvasEngineV2(inputPillWindow, athenaWidgetWindow);
    } else {
        logger.info('[EngineService] Auto-initialization: Using Canvas Engine V1 (legacy)');
        return initializeCanvasEngine(inputPillWindow, athenaWidgetWindow);
    }
};

/**
 * Gets the current active engine instance (V1 or V2).
 * Returns undefined if no engine has been initialized.
 */
export const getCurrentEngineInstance = (): CanvasEngine | CanvasEngineV2 | undefined => {
    return engineV2Instance || engineInstance;
};

/**
 * Gets the version of the currently active engine.
 */
export const getCurrentEngineVersion = (): 'V1' | 'V2' | 'None' => {
    if (engineV2Instance) return 'V2';
    if (engineInstance) return 'V1';
    return 'None';
};

/**
 * Cleans up engine instances. Useful for testing or hot reloading.
 */
export const cleanupEngineInstances = (): void => {
    logger.info('[EngineService] Cleaning up engine instances...');
    engineInstance = undefined;
    engineV2Instance = undefined;
    logger.info('[EngineService] Engine instances cleaned up.');
};
