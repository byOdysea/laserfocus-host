import * as logger from '@utils/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppConfig, configSchema, createDefaultConfig } from './config';

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

      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined) {
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

    // MCP Configuration - migrate from mcp.json if needed, then use main config
    if (envConfig.integrations.mcp.servers.length === 0) {
      // Try to migrate from mcp.json file for initial setup
      const mcpFromFile = this.loadMCPConfigFromFile();
      if (mcpFromFile && (mcpFromFile.enabled || mcpFromFile.servers?.length > 0)) {
        envConfig.integrations.mcp = mcpFromFile;
        logger.info('[Config] Migrated MCP configuration from mcp.json to main config system');
        // Save the migrated configuration so it persists
        this.scheduleSaveMigration();
      }
    }

    return envConfig;
  }

  /**
   * Schedule saving the migrated configuration (debounced)
   */
  private scheduleSaveMigration() {
    if (this.migrationSaveTimeout) {
      clearTimeout(this.migrationSaveTimeout);
    }
    this.migrationSaveTimeout = setTimeout(() => {
      this.save().catch(error => {
        logger.warn('[Config] Failed to save migrated configuration:', error);
      });
    }, 1000); // 1 second debounce
  }

  private migrationSaveTimeout: NodeJS.Timeout | null = null;

  /**
   * Load MCP configuration from mcp.json file (for migration only)
   */
  private loadMCPConfigFromFile() {
    try {
      const mcpConfigPath = path.join(process.cwd(), 'mcp.json');
      if (fs.existsSync(mcpConfigPath)) {
        const mcpData = fs.readFileSync(mcpConfigPath, 'utf8');
        const mcpConfig = JSON.parse(mcpData);
        logger.info('[Config] Found mcp.json for migration');
        return mcpConfig;
      }
    } catch (error) {
      logger.warn('[Config] Failed to read mcp.json for migration:', error);
    }
    return null;
  }

  private mergeConfigs(base: AppConfig, saved: any): AppConfig {
    // Handle integrations merge more carefully to ensure MCP config is preserved
    const baseIntegrations = base.integrations || { mcp: { enabled: false, servers: [] } };
    const savedIntegrations = saved.integrations || {};
    
    // Migrate from mcp.json if saved config doesn't have MCP but file exists
    let mcpConfig = savedIntegrations.mcp;
    if (!mcpConfig || mcpConfig.servers?.length === 0) {
      const mcpFromFile = this.loadMCPConfigFromFile();
      if (mcpFromFile && (mcpFromFile.enabled || mcpFromFile.servers?.length > 0)) {
        mcpConfig = mcpFromFile;
        logger.info('[Config] Migrated MCP configuration from mcp.json during config merge');
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

  async update(updates: Partial<AppConfig>): Promise<void> {
    this.config = configSchema.parse({
      provider: { ...this.config.provider, ...updates.provider },
      system: { ...this.config.system, ...updates.system },
      // Optional future categories
      ...(updates.ui && { ui: { ...this.config.ui, ...updates.ui } }),
      ...(updates.workspace && { workspace: { ...this.config.workspace, ...updates.workspace } }),
      ...(updates.integrations && { integrations: { ...this.config.integrations, ...updates.integrations } }),
      ...(updates.performance && { performance: { ...this.config.performance, ...updates.performance } }),
      ...(updates.security && { security: { ...this.config.security, ...updates.security } })
    });
    
    await this.save();
    
    // Call change callback if registered
    if (this._changeCallbacks.length > 0) {
      this._changeCallbacks.forEach(callback => callback(this.config));
    }
    
    logger.info('[Config] Configuration updated');
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

  onChange(callback: (config: AppConfig) => void): void {
    // Proper event system that supports multiple subscribers
    this._changeCallbacks.push(callback);
    logger.debug(`[Config] Added change callback (${this._changeCallbacks.length} total subscribers)`);
  }

  /**
   * Remove a change callback (for cleanup)
   */
  offChange(callback: (config: AppConfig) => void): void {
    const index = this._changeCallbacks.indexOf(callback);
    if (index > -1) {
      this._changeCallbacks.splice(index, 1);
      logger.debug(`[Config] Removed change callback (${this._changeCallbacks.length} remaining subscribers)`);
    }
  }

  private _changeCallbacks: Array<(config: AppConfig) => void> = [];

  private ensureConfigDirectory(): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }
}

// Export singleton instance for compatibility
export const config = ConfigurationManager.getInstance(); 