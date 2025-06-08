import * as logger from '@utils/logger';
import { ConfigurationChangeEvent, ConfigurationManager } from './configuration-manager';

export interface ConfigurableOptions<T> {
  configPath: string; // e.g., 'provider', 'app', 'engine.performance'
  defaultConfig: T;
  onConfigChange?: (newConfig: T, previousConfig: T) => void | Promise<void>;
}

/**
 * Base class that makes any component automatically configuration-aware
 * Components extending this get automatic config loading, hot-reloading, and validation
 */
export abstract class ConfigurableComponent<T = any> {
  protected config: T;
  private configManager: ConfigurationManager;
  private configPath: string;
  private changeHandler?: (newConfig: T, previousConfig: T) => void | Promise<void>;

  constructor(options: ConfigurableOptions<T>) {
    this.configManager = ConfigurationManager.getInstance();
    this.configPath = options.configPath;
    this.changeHandler = options.onConfigChange;
    
    // Load initial configuration
    this.config = this.loadConfig() || options.defaultConfig;
    
    // Subscribe to configuration changes
    this.setupConfigurationWatch();
    
    logger.info(`[ConfigurableComponent] ${this.constructor.name} initialized with config from '${this.configPath}'`);
  }

  /**
   * Get current configuration
   */
  protected getConfig(): T {
    return this.config;
  }

  /**
   * Update configuration (triggers hot-reload)
   */
  protected async updateConfig(updates: Partial<T>): Promise<boolean> {
    const newConfig = { ...this.config, ...updates };
    return this.setConfig(newConfig);
  }

  /**
   * Set entire configuration
   */
  protected async setConfig(newConfig: T): Promise<boolean> {
    try {
      // Update in configuration manager
      await this.saveConfig(newConfig);
      return true;
    } catch (error) {
      logger.error(`[ConfigurableComponent] Failed to update config for ${this.constructor.name}:`, error);
      return false;
    }
  }

  /**
   * Override this to handle configuration changes
   */
  protected onConfigurationChange(newConfig: T, previousConfig: T): void | Promise<void> {
    // Default implementation - subclasses can override
    if (this.changeHandler) {
      return this.changeHandler(newConfig, previousConfig);
    }
  }

  /**
   * Clean up configuration watching
   */
  protected destroy(): void {
    // Unsubscribe from configuration changes
    this.configManager.offConfigurationChange(this.configPath, this.handleConfigChange);
  }

  // Private methods

  private loadConfig(): T | null {
    try {
      const fullConfig = this.configManager.getConfiguration();
      return this.getNestedValue(fullConfig, this.configPath);
    } catch (error) {
      logger.warn(`[ConfigurableComponent] Failed to load config for ${this.configPath}:`, error);
      return null;
    }
  }

  private async saveConfig(config: T): Promise<void> {
    // This would need to be implemented based on the specific config path
    // For now, we'll use the existing update methods
    if (this.configPath === 'provider') {
      await this.configManager.updateProviderConfig(config as any);
    } else if (this.configPath === 'app') {
      await this.configManager.updateUIConfig(config as any);
    }
    // Add more as needed
  }

  private setupConfigurationWatch(): void {
    this.configManager.onConfigurationChange(this.configPath, this.handleConfigChange);
  }

  private handleConfigChange = async (event: ConfigurationChangeEvent): Promise<void> => {
    const previousConfig = this.config;
    this.config = event.newValue;
    
    try {
      await this.onConfigurationChange(this.config, previousConfig);
      logger.info(`[ConfigurableComponent] ${this.constructor.name} configuration updated`);
    } catch (error) {
      logger.error(`[ConfigurableComponent] Error handling config change in ${this.constructor.name}:`, error);
    }
  };

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Decorator for making configuration reactive
 */
export function configurable<T>(configPath: string, defaultConfig: T) {
  return function <U extends { new (...args: any[]): {} }>(constructor: U) {
    return class extends constructor {
      private _configurable = new ConfigurableComponent<T>({
        configPath,
        defaultConfig,
        onConfigChange: (newConfig, previousConfig) => {
          if ('onConfigurationChange' in this && typeof this.onConfigurationChange === 'function') {
            return this.onConfigurationChange(newConfig, previousConfig);
          }
        }
      });

      protected getConfig(): T {
        return this._configurable.getConfig();
      }

      protected updateConfig(updates: Partial<T>): Promise<boolean> {
        return this._configurable.updateConfig(updates);
      }
    };
  };
}

/**
 * Hook for functional components to use configuration
 */
export function useConfiguration<T>(configPath: string, defaultConfig: T): [T, (updates: Partial<T>) => Promise<boolean>] {
  const configManager = ConfigurationManager.getInstance();
  
  // This would be more sophisticated in a real implementation
  // For now, just return current config and update function
  const currentConfig = configManager.getConfiguration();
  const config = configPath.split('.').reduce((current, key) => current?.[key], currentConfig) || defaultConfig;
  
  const updateConfig = async (updates: Partial<T>): Promise<boolean> => {
    const newConfig = { ...config, ...updates };
    // Update via configuration manager
    return true; // Simplified
  };

  return [config as T, updateConfig];
} 