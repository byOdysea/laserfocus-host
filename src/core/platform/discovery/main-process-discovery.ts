import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import * as logger from '@utils/logger';
import { Display } from 'electron';
import * as path from 'path';
interface AppModule {
    name: string;
    type: 'platform' | 'app' | 'widget';
    mainClass?: any;
    ipcHandlers?: AppIpcModule;
    instance?: any;
    fullPath: string;
}

interface UIDiscoveryConfig {
    uiDir: string;
    primaryDisplay: Display;
    viteDevServerUrl: string | undefined;
    preloadBasePath: string;
}

interface UIComponentRegistry {
    mainClasses: Map<string, any>;
    ipcModules: Map<string, any>;
}

export class UIDiscoveryService {
    private platformComponents: Map<string, AppModule> = new Map();
    private applications: Map<string, AppModule> = new Map();
    private widgets: Map<string, AppModule> = new Map();
    private config: UIDiscoveryConfig;
    private registry: UIComponentRegistry | null = null;

    constructor(config: UIDiscoveryConfig) {
        this.config = config;
    }

    async discoverAndInitializeUIComponents(): Promise<{
        appInstances: AppMainProcessInstances;
        appModules: AppIpcModule[];
    }> {
        logger.info('[UIDiscovery] Starting UI component discovery...');
        
        await this.discoverUIComponents();
        await this.initializePlatformComponents();
        
        return this.getRegistrationData();
    }

    /**
     * Initialize a UI window on-demand (for Canvas Engine)
     */
    async initializeUIWindow(windowName: string): Promise<AppModule | null> {
        const app = this.applications.get(windowName) || this.widgets.get(windowName);
        if (!app) {
            logger.warn(`[UIDiscovery] UI Window ${windowName} not found`);
            return null;
        }

        if (app.instance) {
            // Check if the existing instance's window is destroyed
            if (app.instance.window && app.instance.window.isDestroyed()) {
                logger.info(`[UIDiscovery] UI Window ${windowName} instance exists but window is destroyed - clearing instance`);
                app.instance = null;
            } else {
                logger.info(`[UIDiscovery] UI Window ${windowName} already initialized`);
                return app;
            }
        }

        if (!app.mainClass) {
            logger.warn(`[UIDiscovery] UI Window ${windowName} has no main class`);
            return null;
        }

        try {
            const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.config;
            const preloadPath = path.join(preloadBasePath, `../ui/${app.fullPath}/preload.js`);
            const instance = new app.mainClass(primaryDisplay, viteDevServerUrl, preloadPath);
            
            if (instance.init && typeof instance.init === 'function') {
                instance.init();
                app.instance = instance;
                logger.info(`[UIDiscovery] ${app.type === 'widget' ? 'Widget' : 'Application'} ${windowName} initialized successfully`);
                
                // CRITICAL: Register IPC handlers for dynamically created apps
                if (app.ipcHandlers && this.isValidIpcModule(app.ipcHandlers)) {
                    // Import ipcMain to register handlers
                    const { ipcMain } = require('electron');
                    
                    // Get all app instances for cross-app communication
                    const { appInstances } = this.getRegistrationData();
                    
                    // Add this newly created instance to the instances map
                    const moduleId = app.ipcHandlers.moduleId || windowName;
                    appInstances.set(moduleId, instance);
                    
                    // Register the IPC handlers for this app
                    app.ipcHandlers.registerMainProcessHandlers(ipcMain, instance, appInstances);
                    logger.info(`[UIDiscovery] Registered IPC handlers for dynamically created ${app.type}: ${windowName}`);
                }
                
                return app;
            }
        } catch (error) {
            logger.error(`[UIDiscovery] Failed to initialize ${app.type} ${windowName}:`, error);
        }

        return null;
    }

    private async discoverUIComponents(): Promise<void> {
        // Try to load the registry dynamically
        try {
            const registryModule = await import('./app-registry');
            this.registry = registryModule.createAppRegistry();
            logger.info(`[UIDiscovery] Using auto-generated UI component registry...`);
        } catch (error) {
            logger.warn(`[UIDiscovery] Could not load UI component registry:`, error);
            this.registry = { mainClasses: new Map(), ipcModules: new Map() };
            logger.info(`[UIDiscovery] Using empty registry...`);
        }
        
        if (!this.registry) {
            logger.error(`[UIDiscovery] Registry is null, cannot discover UI components`);
            return;
        }
        
        // Use the generated registry for app discovery
        for (const [appName, mainClass] of this.registry.mainClasses) {
            const app: AppModule = { 
                name: appName,
                type: this.classifyAppType(appName),
                fullPath: this.getAppPath(appName)
            };
            
            if (mainClass) {
                app.mainClass = mainClass;
                logger.debug(`[UIDiscovery] Found main class for ${appName}: ${mainClass.name}`);
            }
            
            const ipcHandlers = this.registry.ipcModules.get(appName);
            if (ipcHandlers && this.isValidIpcModule(ipcHandlers)) {
                app.ipcHandlers = ipcHandlers;
                logger.debug(`[UIDiscovery] Found IPC handlers for ${appName}`);
            }
            
            if (app.mainClass || app.ipcHandlers) {
                if (app.type === 'platform') {
                    this.platformComponents.set(appName, app);
                    logger.debug(`[UIDiscovery] Registered platform UI component: ${appName}`);
                } else if (app.type === 'widget') {
                    this.widgets.set(appName, app);
                    logger.debug(`[UIDiscovery] Registered widget: ${appName}`);
                } else {
                    this.applications.set(appName, app);
                    logger.debug(`[UIDiscovery] Registered application: ${appName}`);
                }
            }
        }
        
        // Also check for any IPC modules without main classes
        for (const [appName, ipcHandlers] of this.registry.ipcModules) {
            if (!this.platformComponents.has(appName) && !this.applications.has(appName) && !this.widgets.has(appName) && this.isValidIpcModule(ipcHandlers)) {
                const app: AppModule = { 
                    name: appName, 
                    type: this.classifyAppType(appName),
                    ipcHandlers,
                    fullPath: this.getAppPath(appName)
                };
                
                if (app.type === 'platform') {
                    this.platformComponents.set(appName, app);
                    logger.debug(`[UIDiscovery] Registered IPC-only platform UI component: ${appName}`);
                } else if (app.type === 'widget') {
                    this.widgets.set(appName, app);
                    logger.debug(`[UIDiscovery] Registered IPC-only widget: ${appName}`);
                } else {
                    this.applications.set(appName, app);
                    logger.debug(`[UIDiscovery] Registered IPC-only application: ${appName}`);
                }
            }
        }
        
        logger.info(`[UIDiscovery] Discovered ${this.platformComponents.size} platform UI components:`, Array.from(this.platformComponents.keys()));
        logger.info(`[UIDiscovery] Discovered ${this.applications.size} applications:`, Array.from(this.applications.keys()));
        logger.info(`[UIDiscovery] Discovered ${this.widgets.size} widgets:`, Array.from(this.widgets.keys()));
    }

    /**
     * Classify app type based on its location in the registry
     */
    private classifyAppType(appName: string): 'platform' | 'app' | 'widget' {
        try {
            const registryModule = require('./app-registry');
            return registryModule.getAppType(appName);
        } catch (error) {
            // Fallback for known platform UI components - using PascalCase to match registry
            const platformUIComponents = ['InputPill', 'AthenaWidget', 'Byokwidget'];
            return platformUIComponents.includes(appName) ? 'platform' : 'app';
        }
    }

    /**
     * Get the full path for an app based on its type
     */
    private getAppPath(appName: string): string {
        try {
            const registryModule = require('./app-registry');
            return registryModule.getAppPath(appName);
        } catch (error) {
            const appType = this.classifyAppType(appName);
            const basePath = appType === 'platform' ? 'platform' : 'apps';
            return `${basePath}/${appName}`;
        }
    }

    private isValidIpcModule(obj: any): obj is AppIpcModule {
        return obj &&
               typeof obj === 'object' &&
               typeof obj.moduleId === 'string' &&
               typeof obj.registerMainProcessHandlers === 'function';
    }

    /**
     * Get all available applications (for Canvas Engine)
     */
    getAvailableApplications(): string[] {
        return Array.from(this.applications.keys());
    }

    /**
     * Get all platform UI components
     */
    getPlatformComponents(): string[] {
        return Array.from(this.platformComponents.keys());
    }

    private async initializePlatformComponents(): Promise<void> {
        // Direct instantiation - using the clean new bridge approach
        logger.info('[UIDiscovery] Using direct instantiation for platform components');
        const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.config;
        
        for (const [appName, app] of this.platformComponents) {
            if (app.mainClass) {
                try {
                    const preloadPath = path.join(preloadBasePath, `../ui/${app.fullPath}/preload.js`);
                    const instance = new app.mainClass(primaryDisplay, viteDevServerUrl, preloadPath);
                    
                    if (instance.init && typeof instance.init === 'function') {
                        instance.init();
                        app.instance = instance;
                        logger.info(`[UIDiscovery] Initialized platform UI component: ${appName}`);
                    }
                } catch (error) {
                    logger.error(`[UIDiscovery] Failed to initialize platform UI component ${appName}:`, error);
                }
            }
        }
    }

    private getRegistrationData(): {
        appInstances: AppMainProcessInstances;
        appModules: AppIpcModule[];
    } {
        const appInstances: AppMainProcessInstances = new Map();
        const appModules: AppIpcModule[] = [];
        
        for (const [appName, app] of this.platformComponents) {
            if (app.instance) {
                // Store instances using the same key as the IPC module's moduleId
                const moduleId = app.ipcHandlers?.moduleId || appName;
                appInstances.set(moduleId, app.instance);
            }
            
            if (app.ipcHandlers) {
                appModules.push(app.ipcHandlers);
            }
        }
        
        for (const [appName, app] of this.applications) {
            if (app.instance) {
                // Store instances using the same key as the IPC module's moduleId
                const moduleId = app.ipcHandlers?.moduleId || appName;
                appInstances.set(moduleId, app.instance);
            }
            
            if (app.ipcHandlers) {
                appModules.push(app.ipcHandlers);
            }
        }
        
        for (const [appName, app] of this.widgets) {
            if (app.instance) {
                // Store instances using the same key as the IPC module's moduleId
                const moduleId = app.ipcHandlers?.moduleId || appName;
                appInstances.set(moduleId, app.instance);
            }
            
            if (app.ipcHandlers) {
                appModules.push(app.ipcHandlers);
            }
        }
        
        return { appInstances, appModules };
    }

    getAppInstance(appName: string): any {
        const app = this.platformComponents.get(appName) || this.applications.get(appName) || this.widgets.get(appName);
        return app?.instance;
    }

    getAllApps(): string[] {
        return Array.from(this.platformComponents.keys())
            .concat(Array.from(this.applications.keys()))
            .concat(Array.from(this.widgets.keys()));
    }

    /**
     * Reload the app registry to discover newly created apps
     */
    async reloadRegistry(): Promise<void> {
        try {
            logger.info('[UIDiscovery] Reloading app registry for hot discovery...');
            
            // Clear existing registry reference to force reload
            delete require.cache[require.resolve('./app-registry')];
            
            // Clear existing discovered components but keep running platform components
            const runningPlatformComponents = new Map(this.platformComponents);
            this.applications.clear();
            this.widgets.clear();
            
            // Re-discover components with fresh registry
            await this.discoverUIComponents();
            
            // Restore running platform components to avoid duplicating them
            for (const [name, component] of runningPlatformComponents) {
                if (component.instance && !component.instance.window?.isDestroyed()) {
                    this.platformComponents.set(name, component);
                }
            }
            
            const totalApps = this.applications.size + this.widgets.size + this.platformComponents.size;
            logger.info(`[UIDiscovery] Registry reloaded: ${totalApps} components discovered`);
            logger.info(`[UIDiscovery] Applications: ${Array.from(this.applications.keys()).join(', ') || 'none'}`);
            logger.info(`[UIDiscovery] Widgets: ${Array.from(this.widgets.keys()).join(', ') || 'none'}`);
            
        } catch (error) {
            logger.error('[UIDiscovery] Failed to reload registry:', error);
            throw error;
        }
    }
}

// Singleton instance
let uiDiscoveryService: UIDiscoveryService | null = null;

/**
 * Set the singleton UI Discovery Service instance
 */
export function setUIDiscoveryService(service: UIDiscoveryService): void {
    uiDiscoveryService = service;
}

/**
 * Get the singleton UI Discovery Service instance
 */
export function getUIDiscoveryService(): UIDiscoveryService | null {
    return uiDiscoveryService;
}

/**
 * Destroy UI Discovery Service (for cleanup)
 */
export function destroyUIDiscoveryService(): void {
    if (uiDiscoveryService) {
        uiDiscoveryService = null;
        logger.info('[UIDiscovery] Destroyed UI discovery service');
    }
} 