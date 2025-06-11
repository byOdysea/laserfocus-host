import * as logger from '@utils/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import defaultMcpConfig from '../../../../mcp.json';
import { AppConfig, configSchema, createDefaultConfig, IS_DEV } from './config';

export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private config: AppConfig;
  private configPath: string;

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

  async load(): Promise<void> {
    try {
      // Start with defaults (no API key)
      let config = createDefaultConfig();

      if (IS_DEV) {
        // Development: Environment variables for non-API config
        config = this.applyEnvironmentVariables(config);
        logger.info('[Config] Development mode: using environment variables (excluding API keys)');
      } else {
        // Production: Config file
        if (fs.existsSync(this.configPath)) {
          try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            const savedConfig = JSON.parse(data);
            config = this.mergeConfigs(config, savedConfig);
            logger.info('[Config] Production mode: using config file (excluding API keys)');
          } catch (error) {
            logger.warn('[Config] Config file corrupted, using defaults:', error);
          }
        } else {
          logger.info('[Config] No config file found, using defaults');
          
          // Load default MCP configuration when no config file exists
          if (!config.integrations) {
            config.integrations = { mcp: { enabled: false, servers: [] } };
          } else if (!config.integrations.mcp) {
            config.integrations.mcp = { enabled: false, servers: [] };
          }
          
          if (config.integrations.mcp.servers.length === 0) {
            const mcpFromFile = this.loadMCPConfigFromFile();
            if (mcpFromFile && (mcpFromFile.enabled || mcpFromFile.servers?.length > 0)) {
              config.integrations.mcp = mcpFromFile;
              logger.info('[Config] Loaded default MCP configuration for first-time setup');
              // Save the configuration so it persists
              this.scheduleSaveMigration();
            }
          }
        }
      }

      // API keys are handled separately by ApiKeyManager
      // Remove any API key that might have leaked in
      config.provider.apiKey = '';

      // Validate the final config
      this.config = configSchema.parse(config);
      logger.info('[Config] Configuration loaded successfully (API keys handled separately)');

    } catch (error) {
      logger.error('[Config] Failed to load configuration:', error);
      this.config = createDefaultConfig();
    }
  }

  private applyEnvironmentVariables(config: AppConfig): AppConfig {
    const envConfig = { ...config };

    // Provider settings (excluding API keys - handled by ApiKeyManager)
    if (process.env.PROVIDER_SERVICE) {
      envConfig.provider.service = process.env.PROVIDER_SERVICE as any;
    }
    if (process.env.PROVIDER_MODEL) {
      envConfig.provider.model = process.env.PROVIDER_MODEL;
    }
    if (process.env.PROVIDER_BASE_URL) {
      envConfig.provider.baseUrl = process.env.PROVIDER_BASE_URL;
    }

    // System settings
    if (process.env.LOG_LEVEL) {
      envConfig.system.logLevel = process.env.LOG_LEVEL as any;
    }

    // Ensure integrations object exists with default MCP config
    if (!envConfig.integrations) {
      envConfig.integrations = {
        mcp: { enabled: false, servers: [] }
      };
    } else if (!envConfig.integrations.mcp) {
      envConfig.integrations.mcp = { enabled: false, servers: [] };
    }

    // MCP Configuration - load from mcp.json if needed, then use main config
    if (envConfig.integrations.mcp.servers.length === 0) {
              // Try to load from mcp.json file for initial setup
      const mcpFromFile = this.loadMCPConfigFromFile();
      if (mcpFromFile && (mcpFromFile.enabled || mcpFromFile.servers?.length > 0)) {
        envConfig.integrations.mcp = mcpFromFile;
        logger.info('[Config] Loaded MCP configuration from mcp.json');
        // Save the configuration so it persists
        this.scheduleSaveMigration();
      }
    }

    return envConfig;
  }

  /**
   * Schedule saving the configuration (debounced)
   */
  private scheduleSaveMigration() {
    if (this.migrationSaveTimeout) {
      clearTimeout(this.migrationSaveTimeout);
    }
    this.migrationSaveTimeout = setTimeout(() => {
      this.save().catch(error => {
        logger.warn('[Config] Failed to save configuration:', error);
      });
    }, 1000); // 1 second debounce
  }

  private migrationSaveTimeout: NodeJS.Timeout | null = null;

  /**
   * Load default MCP configuration (bundled with app) or user's custom mcp.json
   */
  private loadMCPConfigFromFile() {
    try {
      if (IS_DEV) {
        // Development: Use the mcp.json in the repo root for hot-reloading.
        const devMcpPath = path.join(process.cwd(), 'mcp.json');
        if (fs.existsSync(devMcpPath)) {
          try {
            const mcpData = fs.readFileSync(devMcpPath, 'utf8');
            logger.info(`[Config] Using development mcp.json from: ${devMcpPath}`);
            return JSON.parse(mcpData);
          } catch (error) {
            logger.warn(`[Config] Development mcp.json is corrupted, falling back to imported default:`, error);
            // Fallback to imported default if dev file is broken
            return defaultMcpConfig;
          }
        } else {
          // If no mcp.json in dev, use the imported one.
          logger.info(`[Config] Using imported default MCP configuration (dev mode)`);
          return defaultMcpConfig;
        }
      } else {
        // Production: Always use the user's config file.
        const userMcpPath = path.join(os.homedir(), '.laserfocus', 'mcp.json');

        if (!fs.existsSync(userMcpPath)) {
          // If it doesn't exist, create it with the imported defaults.
          logger.info(`[Config] No user MCP config found. Creating default at: ${userMcpPath}`);
          this.copyDefaultMcpToUserConfig(defaultMcpConfig, userMcpPath);
        }

        // Now, always load from the user's config file.
        try {
          const mcpData = fs.readFileSync(userMcpPath, 'utf8');
          logger.info(`[Config] Loaded MCP configuration from: ${userMcpPath}`);
          return JSON.parse(mcpData);
        } catch (error) {
          logger.error(`[Config] User's mcp.json is corrupted. Recreating with defaults:`, error);
          // If file is corrupted, recreate it and return the defaults for this session.
          this.copyDefaultMcpToUserConfig(defaultMcpConfig, userMcpPath);
          return defaultMcpConfig;
        }
      }
    } catch (error) {
      logger.warn('[Config] Critical error in loadMCPConfigFromFile. Returning null.', error);
      return null;
    }
  }

  /**
   * Copy default MCP configuration to user's config directory
   */
  private copyDefaultMcpToUserConfig(mcpConfig: any, userMcpPath: string) {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(userMcpPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // Write the default configuration as a starting point for the user
      fs.writeFileSync(userMcpPath, JSON.stringify(mcpConfig, null, 2));
      logger.info(`[Config] Copied default MCP configuration to: ${userMcpPath}`);
    } catch (error) {
      logger.warn(`[Config] Failed to copy default MCP configuration to user directory:`, error);
    }
  }

  private mergeConfigs(base: AppConfig, saved: any): AppConfig {
    // Handle integrations merge more carefully to ensure MCP config is preserved
    const baseIntegrations = base.integrations || { mcp: { enabled: false, servers: [] } };
    const savedIntegrations = saved.integrations || {};
    
    // Load from mcp.json if saved config doesn't have MCP but file exists
    let mcpConfig = savedIntegrations.mcp;
    if (!mcpConfig || mcpConfig.servers?.length === 0) {
      const mcpFromFile = this.loadMCPConfigFromFile();
      if (mcpFromFile && (mcpFromFile.enabled || mcpFromFile.servers?.length > 0)) {
        mcpConfig = mcpFromFile;
        logger.info('[Config] Loaded MCP configuration from mcp.json during config merge');
      }
    }
    
    const mergedIntegrations = {
      ...baseIntegrations,
      ...savedIntegrations,
      mcp: mcpConfig || baseIntegrations.mcp
    };
    
    return {
      provider: { ...base.provider, ...saved.provider },
      system: { ...base.system, ...saved.system },
      // Optional future categories
      ...(saved.ui && { ui: { ...base.ui, ...saved.ui } }),
      ...(saved.workspace && { workspace: { ...base.workspace, ...saved.workspace } }),
      integrations: mergedIntegrations,
      ...(saved.performance && { performance: { ...base.performance, ...saved.performance } }),
      ...(saved.security && { security: { ...base.security, ...saved.security } })
    };
  }

  async save(): Promise<void> {
    try {
      // Always save a complete config built from defaults
      const defaultConfig = createDefaultConfig();
      const completeConfig = {
        provider: { ...defaultConfig.provider, ...this.config.provider },
        system: { ...defaultConfig.system, ...this.config.system },
        // Only include optional sections if they exist
        ...(this.config.ui && { ui: this.config.ui }),
        ...(this.config.workspace && { workspace: this.config.workspace }),
        ...(this.config.integrations && { integrations: this.config.integrations }),
        ...(this.config.performance && { performance: this.config.performance }),
        ...(this.config.security && { security: this.config.security })
      };
      
      fs.writeFileSync(this.configPath, JSON.stringify(completeConfig, null, 2));
      logger.info('[Config] Complete configuration saved to file');
    } catch (error) {
      logger.error('[Config] Failed to save configuration:', error);
      throw error;
    }
  }

  get(): AppConfig {
    return { ...this.config };
  }

  /**
   * Update a portion of the configuration and save it.
   * @param updates The partial configuration to apply.
   * @param options Optional settings for the update.
   */
  async update(updates: Partial<AppConfig>, options?: { silent?: boolean }): Promise<void> {
    // Store the current config to compare against
    const oldConfig = JSON.parse(JSON.stringify(this.config));

    // Deep merge the updates into the current config
    this.config = this._deepMerge(this.config, updates);
    
    // Validate the updated configuration
    this.config = configSchema.parse(this.config);

    // Persist the changes to the file system
    await this.save();
    
    // Notify listeners about the change
    this.notifyListeners(oldConfig, options);
  }

  hasValidProvider(): boolean {
    const provider = this.config.provider;
    // API keys are handled separately by ApiKeyManager
    return !!provider.service;
  }

  // Legacy compatibility methods
  getProvider() {
    return { ...this.config.provider };
  }

  onChange(callback: (config: AppConfig, options?: { silent?: boolean }) => void): void {
    this._changeCallbacks.push(callback);
    logger.debug(`[Config] Added change callback (${this._changeCallbacks.length} total subscribers)`);
  }

  /**
   * Remove a change callback (for cleanup)
   */
  offChange(callback: (config: AppConfig, options?: { silent?: boolean }) => void): void {
    const index = this._changeCallbacks.indexOf(callback);
    if (index > -1) {
      this._changeCallbacks.splice(index, 1);
      logger.debug(`[Config] Removed change callback (${this._changeCallbacks.length} remaining subscribers)`);
    }
  }

  private _changeCallbacks: Array<(config: AppConfig, options?: { silent?: boolean }) => void> = [];

  private ensureConfigDirectory(): void {
    if (!fs.existsSync(path.dirname(this.configPath))) {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    }
  }

  private notifyListeners(oldConfig: AppConfig, options?: { silent?: boolean }): void {
    const changes = this.getChangedKeys(oldConfig, this.config);
    if (changes.length > 0) {
      if (!options?.silent) {
        logger.debug(`[Config] Notifying ${this._changeCallbacks.length} listeners of changes in: ${changes.join(', ')}`);
      }
      this._changeCallbacks.forEach(cb => cb(this.config, options));
    }
  }

  private getChangedKeys(oldConfig: AppConfig, newConfig: AppConfig): string[] {
    const changes: string[] = [];
    const oldKeys = Object.keys(oldConfig) as Array<keyof AppConfig>;
    const newKeys = Object.keys(newConfig) as Array<keyof AppConfig>;

    const allKeys = [...new Set([...oldKeys, ...newKeys])];

    allKeys.forEach(key => {
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];

      if (this._isObject(oldValue) || this._isObject(newValue)) {
        // For objects (or if one was an object and now isn't, or vice-versa),
        // compare their stringified versions to detect deep changes.
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push(key);
        }
      } else {
        // For primitive types, direct comparison is fine.
        if (oldValue !== newValue) {
          changes.push(key);
        }
      }
    });

    return changes;
  }

  private _isObject(item: any): boolean {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  private _deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this._deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }
}

// Export singleton instance for compatibility
export const config = ConfigurationManager.getInstance(); 