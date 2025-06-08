import { DEFAULT_MODEL_NAME } from '@core/config/app-config';
import { CanvasEngine } from '@core/engine/canvas-engine';
import * as logger from '@utils/logger';
import { BrowserWindow, safeStorage } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let engineInstance: CanvasEngine | undefined;

const API_KEY_STORAGE_FILE = path.join(os.homedir(), '.laserfocus', 'api-keys.json');

/**
 * Load stored API key from file
 */
const loadStoredApiKey = async (): Promise<string | undefined> => {
    try {
        if (!fs.existsSync(API_KEY_STORAGE_FILE)) {
            return undefined;
        }
        
        const data = fs.readFileSync(API_KEY_STORAGE_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        // Decrypt if using safeStorage
        if (parsed.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
            const decrypted = safeStorage.decryptString(Buffer.from(parsed.encryptedApiKey, 'base64'));
            return decrypted;
        } else if (parsed.apiKey) {
            // Fallback to plain text
            return parsed.apiKey;
        }
        
        return undefined;
    } catch (error) {
        logger.error('[EngineService] Error loading stored API key:', error);
        return undefined;
    }
};

/**
 * Initializes and returns a singleton instance of the CanvasEngine.
 */
export const initializeCanvasEngine = async (
    inputPillWindow?: BrowserWindow,
    athenaWidgetWindow?: BrowserWindow
): Promise<CanvasEngine> => {
    if (engineInstance) {
        logger.info('[EngineService] Returning existing CanvasEngine instance.');
        return engineInstance;
    }

    logger.info('[EngineService] Initializing new CanvasEngine instance...');
    
    try {
        // Try to load stored API key if no environment variable is set
        let apiKey = process.env.GOOGLE_API_KEY;
        
        if (!apiKey) {
            try {
                apiKey = await loadStoredApiKey();
                if (apiKey) {
                    logger.info('[EngineService] Loaded API key from storage');
                } else {
                    logger.info('[EngineService] No stored API key found - engine will start in limited mode');
                }
            } catch (loadError) {
                logger.warn('[EngineService] Failed to load stored API key:', loadError);
            }
        }
        
        engineInstance = new CanvasEngine(
            apiKey,
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
 * Update API key in the current engine instance
 */
export const updateEngineApiKey = (apiKey: string): boolean => {
    if (!engineInstance) {
        logger.error('[EngineService] Cannot update API key - no engine instance available');
        return false;
    }
    
    return engineInstance.updateApiKey(apiKey);
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
