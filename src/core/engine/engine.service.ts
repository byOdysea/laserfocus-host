import { BrowserWindow } from 'electron'; // Added BrowserWindow import
import { CanvasEngine } from './canvas-engine';
import * as logger from '../../utils/logger';
import { DEFAULT_MODEL_NAME } from '../config/app-config';

let engineInstance: CanvasEngine | undefined;

/**
 * Initializes and returns a singleton instance of the CanvasEngine.
 * Uses a default model name and expects the GOOGLE_API_KEY to be available in the environment.
 * Logs a warning if the API key appears to be missing or is a placeholder.
 * @returns The initialized CanvasEngine instance.
 * @throws Error if the CanvasEngine constructor fails (e.g., due to a missing API key internally) or if initialization otherwise fails.
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
        // API key is handled within CanvasEngine constructor using process.env.GOOGLE_API_KEY as a fallback
        // We can still log a warning here if it's not explicitly set or using the hardcoded default.
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey || apiKey === "AIzaSyA9pRGCQPDKm6y7xd2mNiFqAAo6tuXtmJs") {
            logger.warn('[EngineService] GOOGLE_API_KEY is not set or using a default placeholder. Please configure for production.');
        }

        engineInstance = new CanvasEngine(apiKey, DEFAULT_MODEL_NAME, [], inputPillWindow, athenaWidgetWindow);
        logger.info(`[EngineService] CanvasEngine initialized successfully with model: ${DEFAULT_MODEL_NAME}.`);
        return engineInstance;
    } catch (error) {
        logger.error('[EngineService] Failed to initialize CanvasEngine:', error);
        throw new Error('Failed to initialize CanvasEngine. Application cannot start.');
    }
};

/**
 * Gets the currently initialized CanvasEngine instance.
 * @returns The CanvasEngine instance or undefined if not initialized.
 */
export const getCanvasEngine = (): CanvasEngine | undefined => {
    return engineInstance;
};
