// API Key Manager - Single Source of Truth
// - Development: Environment variables sync to BYOK storage on startup 
// - Production: Only BYOK storage

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
    updatedAt: string;
}

export class ApiKeyManager {
    private static instance: ApiKeyManager;
    private initialized = false;
    private changeCallbacks: ((provider: string) => void)[] = [];

    static getInstance(): ApiKeyManager {
        if (!ApiKeyManager.instance) {
            ApiKeyManager.instance = new ApiKeyManager();
        }
        return ApiKeyManager.instance;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        const isProduction = process.env.NODE_ENV === 'production';
        
        if (!isProduction) {
            // Development: Sync environment variables to BYOK storage
            await this.syncEnvironmentToStorage();
        }
        
        this.initialized = true;
        logger.info('[ApiKeyManager] Initialized with', isProduction ? 'production' : 'development', 'mode');
    }

    private async syncEnvironmentToStorage(): Promise<void> {
        const envKeys: Partial<StoredApiKeys> = {};
        let hasEnvKeys = false;
        
        // Check each environment variable - including undefined ones
        const envVars = [
            { key: 'GOOGLE_API_KEY', provider: 'google' as const },
            { key: 'OPENAI_API_KEY', provider: 'openai' as const },
            { key: 'ANTHROPIC_API_KEY', provider: 'anthropic' as const }
        ];
        
        for (const envVar of envVars) {
            if (envVar.key in process.env) {
                const value = process.env[envVar.key];
                if (value) {
                    envKeys[envVar.provider] = value;
                    hasEnvKeys = true;
                    logger.info(`[ApiKeyManager] Found ${envVar.provider} API key in environment`);
                } else {
                    // Explicitly clear if environment variable is empty
                    envKeys[envVar.provider] = '';
                    logger.info(`[ApiKeyManager] Clearing ${envVar.provider} API key (empty environment variable)`);
                }
            }
        }

        // Always sync in development mode to ensure consistency
        if (hasEnvKeys || Object.keys(envKeys).length > 0) {
            await this.saveKeys(envKeys);
            logger.info('[ApiKeyManager] Synced environment variables to BYOK storage');
        } else {
            logger.info('[ApiKeyManager] No environment variables found, keeping existing BYOK storage');
        }
    }

    async getApiKey(provider: string): Promise<string | null> {
        try {
            ensureStorageDir();
            
            if (!fs.existsSync(API_KEY_STORAGE_FILE)) {
                return null;
            }
            
            const data = fs.readFileSync(API_KEY_STORAGE_FILE, 'utf8');
            const parsed = JSON.parse(data);
            
            // Get encrypted keys
            const encryptedKey = parsed[`encrypted_${provider}`];
            if (encryptedKey && safeStorage.isEncryptionAvailable()) {
                const decrypted = safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
                return decrypted;
            }
            
            // Fallback to plain text (for development)
            return parsed[provider] || null;
        } catch (error) {
            logger.error(`[ApiKeyManager] Error getting API key for ${provider}:`, error);
            return null;
        }
    }

    async saveApiKey(provider: string, apiKey: string): Promise<void> {
        const keys: Partial<StoredApiKeys> = {};
        keys[provider as keyof StoredApiKeys] = apiKey;
        await this.saveKeys(keys);
        
        // Notify listeners of API key change
        this.changeCallbacks.forEach(callback => {
            try {
                callback(provider);
            } catch (error) {
                logger.error('[ApiKeyManager] Error in change callback:', error);
            }
        });
    }

    private async saveKeys(keys: Partial<StoredApiKeys>): Promise<void> {
        try {
            ensureStorageDir();
            
            // Load existing data
            let data: any = { updatedAt: new Date().toISOString() };
            if (fs.existsSync(API_KEY_STORAGE_FILE)) {
                const existing = JSON.parse(fs.readFileSync(API_KEY_STORAGE_FILE, 'utf8'));
                data = { ...existing, updatedAt: new Date().toISOString() };
            }
            
            // Save each key
            for (const [provider, apiKey] of Object.entries(keys)) {
                if (provider === 'updatedAt') continue;
                
                if (apiKey) {
                    // Use safeStorage if available
                    if (safeStorage.isEncryptionAvailable()) {
                        const encrypted = safeStorage.encryptString(apiKey);
                        data[`encrypted_${provider}`] = encrypted.toString('base64');
                        // Remove plain text version
                        delete data[provider];
                    } else {
                        // Fallback to plain text (not recommended for production)
                        data[provider] = apiKey;
                        logger.warn(`[ApiKeyManager] Storing ${provider} API key in plain text - safeStorage not available`);
                    }
                } else {
                    // Remove the key if empty
                    delete data[provider];
                    delete data[`encrypted_${provider}`];
                }
            }
            
            fs.writeFileSync(API_KEY_STORAGE_FILE, JSON.stringify(data, null, 2));
            logger.info('[ApiKeyManager] API keys saved successfully');
        } catch (error) {
            logger.error('[ApiKeyManager] Error saving API keys:', error);
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
        const providers = ['google', 'openai', 'anthropic'];
        const statuses: Record<string, boolean> = {};
        
        for (const provider of providers) {
            statuses[provider] = await this.hasApiKey(provider);
        }
        
        return statuses;
    }

    // Register callback for API key changes
    onChange(callback: (provider: string) => void): void {
        this.changeCallbacks.push(callback);
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