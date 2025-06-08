import { AppIpcModule, AppMainProcessInstances } from '@core/bridge/types';
import { CanvasEngine } from '@core/engine/canvas-engine';
import { ByokwidgetWindow } from '@ui/platform/Byokwidget/byokwidget.main';
import * as logger from '@utils/logger';
import { IpcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const API_KEY_STORAGE_FILE = path.join(os.homedir(), '.laserfocus', 'api-keys.json');

// Ensure the directory exists
const ensureStorageDir = () => {
    const dir = path.dirname(API_KEY_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Simple API key validation
const validateApiKey = (apiKey: string): boolean => {
    if (!apiKey || apiKey.trim().length < 10) {
        return false;
    }
    
    // Basic validation for common API key formats
    const patterns = [
        /^AIza[0-9A-Za-z-_]{35}$/, // Google AI
        /^sk-[a-zA-Z0-9]{32,}$/, // OpenAI
        /^[a-zA-Z0-9-_]{32,}$/, // Generic pattern
    ];
    
    return patterns.some(pattern => pattern.test(apiKey.trim()));
};

// Test API key by making a simple request
const testApiKey = async (apiKey: string): Promise<boolean> => {
    try {
        // For Google AI API
        if (apiKey.startsWith('AIza')) {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            return response.ok;
        }
        
        // For OpenAI API
        if (apiKey.startsWith('sk-')) {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });
            return response.ok;
        }
        
        // For other APIs, just validate format
        return validateApiKey(apiKey);
    } catch (error) {
        logger.error('[BYOK] API key test failed:', error);
        return false;
    }
};

const ByokwidgetIpcHandlers: AppIpcModule = {
    moduleId: 'byokwidget',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        canvasEngine: CanvasEngine,
        appInstance: ByokwidgetWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[BYOK-IPC] Registering BYOK helper IPC handlers');

        // Get stored API key
        ipcMain.handle('byokwidget:get-api-key', async () => {
            try {
                ensureStorageDir();
                
                if (!fs.existsSync(API_KEY_STORAGE_FILE)) {
                    return { success: true, apiKey: '' };
                }
                
                const data = fs.readFileSync(API_KEY_STORAGE_FILE, 'utf8');
                const parsed = JSON.parse(data);
                
                // Decrypt if using safeStorage
                let apiKey = '';
                if (parsed.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(Buffer.from(parsed.encryptedApiKey, 'base64'));
                    apiKey = decrypted;
                } else if (parsed.apiKey) {
                    // Fallback to plain text (not recommended for production)
                    apiKey = parsed.apiKey;
                }
                
                return { success: true, apiKey: apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4) };
            } catch (error) {
                logger.error('[BYOK-IPC] Error getting API key:', error);
                return { success: false, error: 'Failed to retrieve API key' };
            }
        });

        // Save API key
        ipcMain.handle('byokwidget:save-api-key', async (event, apiKey: string) => {
            try {
                if (!validateApiKey(apiKey)) {
                    return { success: false, error: 'Invalid API key format' };
                }
                
                ensureStorageDir();
                
                const data: any = {
                    updatedAt: new Date().toISOString(),
                };
                
                // Use safeStorage if available
                if (safeStorage.isEncryptionAvailable()) {
                    const encrypted = safeStorage.encryptString(apiKey);
                    data.encryptedApiKey = encrypted.toString('base64');
                } else {
                    // Fallback to plain text (not recommended for production)
                    data.apiKey = apiKey;
                    logger.warn('[BYOK-IPC] Storing API key in plain text - safeStorage not available');
                }
                
                fs.writeFileSync(API_KEY_STORAGE_FILE, JSON.stringify(data, null, 2));
                
                // Update the Canvas Engine with the new API key
                try {
                    // Import the engine service dynamically to avoid circular dependencies
                    const { updateEngineApiKey } = await import('@core/engine/engine.service');
                    const updateSuccess = updateEngineApiKey(apiKey);
                    
                    if (updateSuccess) {
                        logger.info('[BYOK-IPC] API key saved and Canvas Engine updated successfully');
                    } else {
                        logger.warn('[BYOK-IPC] API key saved but failed to update Canvas Engine');
                    }
                } catch (engineError) {
                    logger.error('[BYOK-IPC] Failed to update Canvas Engine with new API key:', engineError);
                    // Don't fail the save operation if engine update fails
                }
                
                logger.info('[BYOK-IPC] API key saved successfully');
                
                return { success: true };
            } catch (error) {
                logger.error('[BYOK-IPC] Error saving API key:', error);
                return { success: false, error: 'Failed to save API key' };
            }
        });

        // Test API key
        ipcMain.handle('byokwidget:test-api-key', async (event, apiKey: string) => {
            try {
                if (!validateApiKey(apiKey)) {
                    return { success: false, error: 'Invalid API key format' };
                }
                
                const isValid = await testApiKey(apiKey);
                
                if (isValid) {
                    return { success: true };
                } else {
                    return { success: false, error: 'API key test failed - please check the key' };
                }
            } catch (error) {
                logger.error('[BYOK-IPC] Error testing API key:', error);
                return { success: false, error: 'Failed to test API key' };
            }
        });

        // Test stored API key (for status validation)
        ipcMain.handle('byokwidget:test-stored-key', async () => {
            try {
                ensureStorageDir();
                
                if (!fs.existsSync(API_KEY_STORAGE_FILE)) {
                    return { success: false, error: 'No API key stored' };
                }
                
                const data = fs.readFileSync(API_KEY_STORAGE_FILE, 'utf8');
                const parsed = JSON.parse(data);
                
                // Decrypt and get full key
                let apiKey = '';
                if (parsed.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(Buffer.from(parsed.encryptedApiKey, 'base64'));
                    apiKey = decrypted;
                } else if (parsed.apiKey) {
                    apiKey = parsed.apiKey;
                }
                
                if (!apiKey) {
                    return { success: false, error: 'No valid API key found' };
                }
                
                // Test the actual key
                const isValid = await testApiKey(apiKey);
                
                if (isValid) {
                    return { success: true };
                } else {
                    return { success: false, error: 'Stored API key is invalid' };
                }
            } catch (error) {
                logger.error('[BYOK-IPC] Error testing stored API key:', error);
                return { success: false, error: 'Failed to test stored API key' };
            }
        });

        // Focus the app window
        ipcMain.on('byokwidget:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[BYOK-IPC] BYOK helper IPC handlers registered successfully');
    }
};

export default ByokwidgetIpcHandlers;