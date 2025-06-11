// API Key Manager - Single Source of Truth
// - Caches keys in memory for performance and to prevent race conditions.
// - Development: Syncs environment variables to BYOK storage on startup.
// - Production: Uses BYOK storage exclusively.

import * as logger from '@utils/logger';
import { safeStorage } from 'electron';
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

interface StoredApiKeys {
    google?: string;
    openai?: string;
    anthropic?: string;
    updatedAt?: string; // Optional because we don't store it in the in-memory cache
}

export class ApiKeyManager {
    private static instance: ApiKeyManager;
    private initialized = false;
    private keys: Partial<StoredApiKeys> = {};
    private changeCallbacks: ((provider: string) => void)[] = [];

    static getInstance(): ApiKeyManager {
        if (!ApiKeyManager.instance) {
            ApiKeyManager.instance = new ApiKeyManager();
        }
        return ApiKeyManager.instance;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        ensureStorageDir();
        await this._loadKeysFromFile();

        const isProduction = process.env.NODE_ENV === 'production';
        if (!isProduction) {
            await this.syncEnvironmentToStorage();
        }
        
        this.initialized = true;
        logger.info('[ApiKeyManager] Initialized with', isProduction ? 'production' : 'development', 'mode');
    }

    private async _loadKeysFromFile(): Promise<void> {
        try {
            if (!fs.existsSync(API_KEY_STORAGE_FILE)) {
                this.keys = {};
                return;
            }
            
            const data = fs.readFileSync(API_KEY_STORAGE_FILE, 'utf8');
            const parsed = JSON.parse(data);
            const loadedKeys: Partial<StoredApiKeys> = {};

            const providers = ['google', 'openai', 'anthropic'];
            for (const provider of providers) {
                const key = `encrypted_${provider}`;
                if (parsed[key] && safeStorage.isEncryptionAvailable()) {
                    const decrypted = safeStorage.decryptString(Buffer.from(parsed[key], 'base64'));
                    loadedKeys[provider as keyof StoredApiKeys] = decrypted;
                } else if (parsed[provider]) {
                    // Fallback for plain text keys
                    loadedKeys[provider as keyof StoredApiKeys] = parsed[provider];
                }
            }
            this.keys = loadedKeys;
            logger.info('[ApiKeyManager] Loaded API keys from storage into memory.');
        } catch (error) {
            logger.error('[ApiKeyManager] Error loading API keys from file:', error);
            this.keys = {}; // Start fresh on error
        }
    }

    private async syncEnvironmentToStorage(): Promise<void> {
        const envKeys: Partial<StoredApiKeys> = {};
        let needsSync = false;
        
        const envVars = [
            { key: 'GOOGLE_API_KEY', provider: 'google' as const },
            { key: 'OPENAI_API_KEY', provider: 'openai' as const },
            { key: 'ANTHROPIC_API_KEY', provider: 'anthropic' as const }
        ];
        
        for (const { key, provider } of envVars) {
            if (key in process.env) {
                const value = process.env[key] || ''; // Treat empty var as empty string
                // Sync if the env key is different from the loaded key
                if (this.keys[provider] !== value) {
                    envKeys[provider] = value;
                    needsSync = true;
                    if (value) {
                        logger.info(`[ApiKeyManager] Found different ${provider} API key in environment, queuing for sync.`);
                    } else {
                        logger.info(`[ApiKeyManager] Environment variable for ${provider} is empty, queuing for sync.`);
                    }
                }
            }
        }

        if (needsSync) {
            await this.saveKeys(envKeys, false); // Don't notify on initial sync
            logger.info('[ApiKeyManager] Synced environment variables to BYOK storage.');
        } else {
            logger.info('[ApiKeyManager] No environment variable changes detected, skipping sync.');
        }
    }

    async getApiKey(provider: string): Promise<string | null> {
        if (!this.initialized) {
            // This should ideally not be hit if initialize is called on startup
            await this.initialize();
        }
        return (this.keys[provider as keyof StoredApiKeys] as string) || null;
    }

    async saveApiKey(provider: string, apiKey: string): Promise<void> {
        await this.saveKeys({ [provider]: apiKey });
    }

    private async saveKeys(keysToSave: Partial<StoredApiKeys>, notify = true): Promise<void> {
        const providersChanged: string[] = [];

        // 1. Update in-memory cache first and track changes
        for (const [provider, apiKey] of Object.entries(keysToSave)) {
            const p = provider as keyof StoredApiKeys;
            if (this.keys[p] !== apiKey) {
                if (apiKey) {
                    this.keys[p] = apiKey;
                } else {
                    delete this.keys[p];
                }
                providersChanged.push(p);
            }
        }

        if (providersChanged.length === 0) {
            logger.info('[ApiKeyManager] No key changes detected, skipping save.');
            return;
        }

        // 2. Persist the entire current state of keys to disk
        try {
            const dataToStore: any = { updatedAt: new Date().toISOString() };
            for (const [provider, apiKey] of Object.entries(this.keys)) {
                if (!apiKey) continue;
                
                if (safeStorage.isEncryptionAvailable()) {
                    const encrypted = safeStorage.encryptString(apiKey);
                    dataToStore[`encrypted_${provider}`] = encrypted.toString('base64');
                } else {
                    dataToStore[provider] = apiKey;
                    logger.warn(`[ApiKeyManager] Storing ${provider} API key in plain text - safeStorage not available.`);
                }
            }
            
            fs.writeFileSync(API_KEY_STORAGE_FILE, JSON.stringify(dataToStore, null, 2));
            logger.info(`[ApiKeyManager] API keys saved successfully for providers: ${providersChanged.join(', ')}`);

            // 3. Notify listeners about the providers that actually changed
            if (notify) {
                providersChanged.forEach(p => {
                    this.changeCallbacks.forEach(callback => {
                        try {
                            callback(p);
                        } catch (error) {
                            logger.error('[ApiKeyManager] Error in change callback:', error);
                        }
                    });
                });
            }
        } catch (error) {
            logger.error('[ApiKeyManager] Error saving API keys:', error);
            // Consider rolling back in-memory change on failure
            await this._loadKeysFromFile(); 
            throw error;
        }
    }

    async getMaskedApiKey(provider: string): Promise<string> {
        const apiKey = await this.getApiKey(provider);
        if (!apiKey) return '';
        
        return apiKey.length > 12 
            ? apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4)
            : '***...***';
    }

    async hasApiKey(provider: string): Promise<boolean> {
        const apiKey = await this.getApiKey(provider);
        return !!apiKey;
    }

    async deleteApiKey(provider: string): Promise<void> {
        await this.saveApiKey(provider, '');
    }

    async getAllProviderStatuses(): Promise<Record<string, boolean>> {
        if (!this.initialized) await this.initialize();
        const providers = ['google', 'openai', 'anthropic'];
        const statuses: Record<string, boolean> = {};
        
        for (const provider of providers) {
            statuses[provider] = !!this.keys[provider as keyof StoredApiKeys];
        }
        
        return statuses;
    }

    // Register callback for API key changes
    onChange(callback: (provider: string) => void): void {
        this.changeCallbacks.push(callback);
        logger.debug(`[Config] Added change callback (${this.changeCallbacks.length} total subscribers)`);
    }

    // Remove callback
    removeChangeListener(callback: (provider: string) => void): void {
        const index = this.changeCallbacks.indexOf(callback);
        if (index > -1) {
            this.changeCallbacks.splice(index, 1);
        }
    }
}

export const apiKeyManager = ApiKeyManager.getInstance();