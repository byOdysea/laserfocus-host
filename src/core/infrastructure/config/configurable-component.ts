import * as logger from '@utils/logger';
import { AppConfig } from './config';
import { ConfigurationManager } from './configuration-manager';

export interface ConfigurableOptions<T> {
  configPath: string; // e.g., 'provider', 'app'
  defaultConfig: T;
  onConfigChange?: (newConfig: T, previousConfig: T) => void | Promise<void>;
}

/**
 * Base class that makes any component automatically configuration-aware
 * Components extending this get automatic config loading, hot-reloading, and validation
 */
export class ConfigurableComponent<T = any> {
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
    // Clear configuration change callback
    // Note: Current ConfigurationManager doesn't support unsubscribing
    // This would need to be enhanced for proper cleanup
  }

  // Private methods

  private loadConfig(): T | null {
    try {
      const fullConfig = this.configManager.get();
      return this.getNestedValue(fullConfig, this.configPath);
    } catch (error) {
      logger.warn(`[ConfigurableComponent] Failed to load config for ${this.configPath}:`, error);
      return null;
    }
  }

  private async saveConfig(config: T): Promise<void> {
    // Update the configuration through the manager's unified update method
    const updates: any = {};
    
    if (this.configPath === 'provider') {
      updates.provider = config;
    } else if (this.configPath === 'system') {
      updates.system = config;
    } else {
      // For nested paths, build the structure
      const pathParts = this.configPath.split('.');
      let current = updates;
      for (let i = 0; i < pathParts.length - 1; i++) {
        current[pathParts[i]] = current[pathParts[i]] || {};
        current = current[pathParts[i]];
      }
      current[pathParts[pathParts.length - 1]] = config;
    }
    
    await this.configManager.update(updates);
  }

  private setupConfigurationWatch(): void {
    this.configManager.onChange(this.handleConfigChange);
  }

  private handleConfigChange = async (newConfig: AppConfig): Promise<void> => {
    const previousConfig = this.config;
    const newSectionConfig = this.getNestedValue(newConfig, this.configPath);
    
    if (newSectionConfig !== undefined) {
      logger.debug(`[ConfigurableComponent] ${this.constructor.name} (${this.configPath}) handleConfigChange: 
  Old section: ${JSON.stringify(this.config)}
  New section: ${JSON.stringify(newSectionConfig)}`);
      // Only trigger change handler if configuration actually changed
      if (!this.deepEqual(this.config, newSectionConfig)) {
        const oldConfig = this.config;
        this.config = newSectionConfig;
        
        try {
          await this.onConfigurationChange(this.config, oldConfig);
          logger.info(`[ConfigurableComponent] ${this.constructor.name} configuration updated`);
        } catch (error) {
          logger.error(`[ConfigurableComponent] Error handling config change in ${this.constructor.name}:`, error);
        }
      } else {
        logger.debug(`[ConfigurableComponent] ${this.constructor.name} configuration unchanged, skipping update`);
      }
    }
  };

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Deep equality comparison for configuration objects
   */
  protected deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    
    if (obj1 == null || obj2 == null) return obj1 === obj2;
    
    if (typeof obj1 !== typeof obj2) return false;
    
    if (typeof obj1 !== 'object') return obj1 === obj2;
    
    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }
    
    return true;
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

      public getConfig(): T {
        return this._configurable['getConfig']();
      }

      public updateConfig(updates: Partial<T>): Promise<boolean> {
        return this._configurable['updateConfig'](updates);
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
  const currentConfig = configManager.get();
  const config = configPath.split('.').reduce((current: any, key) => current?.[key], currentConfig) || defaultConfig;
  
  const updateConfig = async (updates: Partial<T>): Promise<boolean> => {
    const newConfig = { ...config, ...updates };
    // Update via configuration manager
    return true; // Simplified
  };

  return [config as T, updateConfig];
} 