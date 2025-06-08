import * as logger from '@utils/logger';
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppConfig, AppConfigSchema, createDefaultConfig } from './config';

type ConfigChangeCallback = (newConfig: AppConfig) => void;

/**
 * Simple, clean configuration manager for LaserFocus
 * 
 * Philosophy: Keep it simple, make it work, easy to extend
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private config: AppConfig;
  private configPath: string;
  private changeCallbacks: ConfigChangeCallback[] = [];

  private constructor() {
    this.configPath = path.join(os.homedir(), '.laserfocus', 'config.json');
    this.config = createDefaultConfig();
    this.ensureConfigDirectory();
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Load configuration from disk
   */
  async load(): Promise<void> {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.info('[Config] No config file found, using defaults');
        return;
      }

      const data = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(data);

      // Handle encrypted API keys
      if (parsed.provider?.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
        try {
          const decrypted = safeStorage.decryptString(Buffer.from(parsed.provider.encryptedApiKey, 'base64'));
          parsed.provider.apiKey = decrypted;
          delete parsed.provider.encryptedApiKey;
        } catch (error) {
          logger.warn('[Config] Failed to decrypt API key:', error);
        }
      }

      // Validate and merge with defaults
      this.config = AppConfigSchema.parse({ ...createDefaultConfig(), ...parsed });
      logger.info('[Config] Configuration loaded successfully');
    } catch (error) {
      logger.error('[Config] Failed to load configuration:', error);
      this.config = createDefaultConfig();
    }
  }

  /**
   * Save configuration to disk
   */
  async save(): Promise<void> {
    try {
      const configToSave = { ...this.config };

      // Encrypt API key if available
      if (configToSave.provider.apiKey && safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = safeStorage.encryptString(configToSave.provider.apiKey);
          (configToSave.provider as any).encryptedApiKey = encrypted.toString('base64');
          delete (configToSave.provider as any).apiKey;
        } catch (error) {
          logger.warn('[Config] Failed to encrypt API key, storing in plain text:', error);
        }
      }

      fs.writeFileSync(this.configPath, JSON.stringify(configToSave, null, 2));
      logger.info('[Config] Configuration saved successfully');
    } catch (error) {
      logger.error('[Config] Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  get(): AppConfig {
    return { ...this.config };
  }

  /**
   * Get specific configuration section
   */
  getProvider() {
    return { ...this.config.provider };
  }

  getApp() {
    return { ...this.config.app };
  }

  getEngine() {
    return { ...this.config.engine };
  }

  /**
   * Update provider configuration
   */
  async updateProvider(updates: Partial<AppConfig['provider']>): Promise<void> {
    const newProvider = { ...this.config.provider, ...updates };
    
    // Validate
    const validated = AppConfigSchema.shape.provider.parse(newProvider);
    
    this.config.provider = validated;
    await this.save();
    this.notifyChange();
    
    logger.info(`[Config] Provider updated: ${validated.service}`);
  }

  /**
   * Update app configuration
   */
  async updateApp(updates: Partial<AppConfig['app']>): Promise<void> {
    const newApp = { ...this.config.app, ...updates };
    
    // Validate
    const validated = AppConfigSchema.shape.app.parse(newApp);
    
    this.config.app = validated;
    await this.save();
    this.notifyChange();
    
    logger.info('[Config] App settings updated');
  }

  /**
   * Update engine configuration
   */
  async updateEngine(updates: Partial<AppConfig['engine']>): Promise<void> {
    const newEngine = { ...this.config.engine, ...updates };
    
    // Validate
    const validated = AppConfigSchema.shape.engine.parse(newEngine);
    
    this.config.engine = validated;
    await this.save();
    this.notifyChange();
    
    logger.info('[Config] Engine settings updated');
  }

  /**
   * Check if we have a valid provider configuration
   */
  hasValidProvider(): boolean {
    return !!(this.config.provider.apiKey && this.config.provider.service);
  }

  /**
   * Subscribe to configuration changes
   */
  onChange(callback: ConfigChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Unsubscribe from configuration changes
   */
  offChange(callback: ConfigChangeCallback): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index > -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  /**
   * Reset to defaults
   */
  async reset(): Promise<void> {
    this.config = createDefaultConfig();
    await this.save();
    this.notifyChange();
    logger.info('[Config] Reset to defaults');
  }

  // Private methods

  private ensureConfigDirectory(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private notifyChange(): void {
    this.changeCallbacks.forEach(callback => {
      try {
        callback(this.get());
      } catch (error) {
        logger.error('[Config] Error in change callback:', error);
      }
    });
  }
}

// Simple export pattern
export const config = ConfigurationManager.getInstance(); 