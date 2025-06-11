import { createLogger } from '@/lib/utils/logger';
import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import { BrowserWindow, Display } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const logger = createLogger('[UIDiscovery]');

export interface AppModuleInstance {
    window?: BrowserWindow;
    init?: () => void;
}

export type AppModuleConstructor = new (
    primaryDisplay: Display,
    viteDevServerUrl: string | undefined,
    preloadPath: string
) => AppModuleInstance;

interface AppModule {
    name: string;
    type: 'platform' | 'app' | 'widget';
    mainClass?: AppModuleConstructor;
    ipcHandlers?: AppIpcModule;
    instance?: AppModuleInstance;
    fullPath: string;
    actualPath: string; // File system path
}

interface UIDiscoveryConfig {
    uiDir: string;
    primaryDisplay: Display;
    viteDevServerUrl: string | undefined;
    preloadBasePath: string;
}

interface UIComponentRegistry {
    mainClasses: Map<string, AppModuleConstructor>;
    ipcModules: Map<string, AppIpcModule>;
}

interface DiscoveredComponent {
    name: string;
    type: 'platform' | 'app' | 'widget';
    path: string;
    hasMain: boolean;
    hasIpc: boolean;
    hasPreload: boolean;
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
        logger.info('Starting UI component discovery...');
        
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
            logger.warn(`UI Window ${windowName} not found`);
            return null;
        }

        if (app.instance) {
            // Check if the existing instance's window is destroyed
            if (app.instance.window && app.instance.window.isDestroyed()) {
                logger.info(`UI Window ${windowName} instance exists but window is destroyed - clearing instance`);
                app.instance = undefined;
            } else {
                logger.info(`UI Window ${windowName} already initialized`);
                return app;
            }
        }

        if (!app.mainClass) {
            logger.warn(`UI Window ${windowName} has no main class`);
            return null;
        }

        try {
            const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.config;
            // Use actualPath for preload script to avoid case sensitivity issues
            const preloadPath = path.join(preloadBasePath, `../ui/${app.actualPath}/preload.js`);
            const instance = new app.mainClass(primaryDisplay, viteDevServerUrl, preloadPath);
            
            if (instance.init && typeof instance.init === 'function') {
                instance.init();
                app.instance = instance;
                logger.info(`${app.type === 'widget' ? 'Widget' : 'Application'} ${windowName} initialized successfully`);
                
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
                    const ipcModule = app.ipcHandlers;
                    ipcModule.registerMainProcessHandlers(ipcMain, instance, appInstances);
                    logger.info(`Registered IPC handlers for dynamically created ${app.type}: ${windowName}`);

                    // Add a listener to unregister handlers when the window is closed
                    if (instance.window && ipcModule.unregisterMainProcessHandlers) {
                        instance.window.on('closed', () => {
                            ipcModule.unregisterMainProcessHandlers!(ipcMain, instance);
                            logger.info(`Unregistered IPC handlers for ${app.type}: ${windowName}`);
                        });
                    }
                }
                
                return app;
            }
        } catch (error) {
            logger.error(`Failed to initialize ${app.type} ${windowName}:`, error);
        }

        return null;
    }

    private async discoverUIComponents(): Promise<void> {
        // Try to load the registry dynamically first
        try {
            const registryModule = await import('./app-registry');
            this.registry = registryModule.createAppRegistry();
            logger.info(`Using auto-generated UI component registry...`);
            
            // Use registry-based discovery
            await this.discoverFromRegistry();
            
        } catch (error) {
            logger.warn(`Could not load UI component registry, falling back to dynamic discovery:`, error);
            this.registry = { mainClasses: new Map(), ipcModules: new Map() };
            
            // Fallback to dynamic file system discovery
            await this.discoverUIComponentsDynamically();
        }
        
        logger.info(`Discovered ${this.platformComponents.size} platform UI components:`, Array.from(this.platformComponents.keys()));
        logger.info(`Discovered ${this.applications.size} applications:`, Array.from(this.applications.keys()));
        logger.info(`Discovered ${this.widgets.size} widgets:`, Array.from(this.widgets.keys()));
    }

    /**
     * Original registry-based discovery (refactored)
     */
    private async discoverFromRegistry(): Promise<void> {
        if (!this.registry) {
            logger.error(`Registry is null, cannot discover UI components`);
            return;
        }
        
        // Use the generated registry for app discovery
        for (const [appName, mainClass] of this.registry.mainClasses) {
            const app: AppModule = { 
                name: appName,
                type: this.classifyAppType(appName),
                fullPath: this.getAppPath(appName),
                actualPath: this.getAppPath(appName)  // Store the actual file system path
            };
            
            if (mainClass) {
                app.mainClass = mainClass;
                logger.debug(`Found main class for ${appName}: ${mainClass.name}`);
            }
            
            const ipcHandlers = this.registry.ipcModules.get(appName);
            if (ipcHandlers && this.isValidIpcModule(ipcHandlers)) {
                app.ipcHandlers = ipcHandlers;
                logger.debug(`Found IPC handlers for ${appName}`);
            }
            
            if (app.mainClass || app.ipcHandlers) {
                if (app.type === 'platform') {
                    this.platformComponents.set(appName, app);
                    logger.debug(`Registered platform UI component: ${appName}`);
                } else if (app.type === 'widget') {
                    this.widgets.set(appName, app);
                    logger.debug(`Registered widget: ${appName}`);
                } else {
                    this.applications.set(appName, app);
                    logger.debug(`Registered application: ${appName}`);
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
                    fullPath: this.getAppPath(appName),
                    actualPath: this.getAppPath(appName)  // Store the actual file system path
                };
                
                if (app.type === 'platform') {
                    this.platformComponents.set(appName, app);
                    logger.debug(`Registered IPC-only platform UI component: ${appName}`);
                } else if (app.type === 'widget') {
                    this.widgets.set(appName, app);
                    logger.debug(`Registered IPC-only widget: ${appName}`);
                } else {
                    this.applications.set(appName, app);
                    logger.debug(`Registered IPC-only application: ${appName}`);
                }
            }
        }
    }

    /**
     * Classify app type based on its location in the registry
     */
    private classifyAppType(appName: string): 'platform' | 'app' | 'widget' {
        try {
            const registryModule = require('./app-registry');
            return registryModule.getAppType(appName);
        } catch (error) {
            // Fallback for known platform UI components - using exact case to match registry
            const platformUIComponents = ['AthenaWidget', 'Byokwidget', 'InputPill'];
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
            // Fallback with correct case preservation for all known components
            const knownAppPaths: Record<string, string> = {
                // Platform components (PascalCase)
                'AthenaWidget': 'platform/AthenaWidget',
                'Byokwidget': 'platform/Byokwidget',
                'InputPill': 'platform/InputPill',
                // Applications (lowercase)
                'Notes': 'apps/notes',
                'Reminders': 'apps/reminders',
                'Settings': 'apps/settings'
            };
            
            if (knownAppPaths[appName]) {
                return knownAppPaths[appName];
            }
            
            const appType = this.classifyAppType(appName);
            const basePath = appType === 'platform' ? 'platform' : 'apps';
            // For unknown apps, keep the original case to avoid breaking paths
            const safeName = appName;
            return `${basePath}/${safeName}`;
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
        logger.info('Using direct instantiation for platform components');
        const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.config;
        
        for (const [appName, app] of this.platformComponents) {
            if (app.mainClass) {
                try {
                    // Use actualPath for preload script to avoid case sensitivity issues
                    const preloadPath = path.join(preloadBasePath, `../ui/${app.actualPath}/preload.js`);
                    const instance = new app.mainClass(primaryDisplay, viteDevServerUrl, preloadPath);
                    
                    if (instance.init && typeof instance.init === 'function') {
                        instance.init();
                        app.instance = instance;
                        logger.info(`Initialized platform UI component: ${appName}`);
                    }
                } catch (error) {
                    logger.error(`Failed to initialize platform UI component ${appName}:`, error);
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
        
        this.platformComponents.forEach((app, name) => {
            if (app.instance) {
                appInstances.set(name, app.instance);
            }
            if (app.ipcHandlers) {
                appModules.push(app.ipcHandlers);
            }
        });

        this.applications.forEach((app, name) => {
            if (app.instance) {
                appInstances.set(name, app.instance);
            }
            if (app.ipcHandlers) {
                appModules.push(app.ipcHandlers);
            }
        });

        this.widgets.forEach((app, name) => {
            if (app.instance) {
                appInstances.set(name, app.instance);
            }
            if (app.ipcHandlers) {
                appModules.push(app.ipcHandlers);
            }
        });
        
        return { appInstances, appModules };
    }

    getAppInstance(appName: string): AppModuleInstance | undefined {
        const app =
            this.applications.get(appName) ||
            this.widgets.get(appName) ||
            this.platformComponents.get(appName);
        
        return app?.instance;
    }

    getAllApps(): string[] {
        const apps = Array.from(this.applications.keys());
        const widgets = Array.from(this.widgets.keys());
        const platform = Array.from(this.platformComponents.keys());
        return [...apps, ...widgets, ...platform];
    }

    /**
     * Reload the app registry to discover newly created apps
     */
    async reloadRegistry(): Promise<void> {
        try {
            logger.info('Reloading app registry for hot discovery...');
            
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
            logger.info(`Registry reloaded: ${totalApps} components discovered`);
            logger.info(`Applications: ${Array.from(this.applications.keys()).join(', ') || 'none'}`);
            logger.info(`Widgets: ${Array.from(this.widgets.keys()).join(', ') || 'none'}`);
            
        } catch (error) {
            logger.error('Failed to reload registry:', error);
            throw error;
        }
    }

    /**
     * NEW: Dynamic discovery by scanning the file system
     */
    private async discoverUIComponentsDynamically(): Promise<void> {
        logger.info('Starting dynamic file system discovery...');
        
        const uiBasePath = path.join(process.cwd(), 'src', 'ui');
        const discoveredComponents = await this.scanUIDirectory(uiBasePath);
        
        logger.info(`Discovered ${discoveredComponents.length} components via file system scan`);
        
        for (const component of discoveredComponents) {
            const app: AppModule = {
                name: component.name,
                type: component.type,
                fullPath: component.path,
                actualPath: component.path  // Store the actual file system path
            };
            
            // Try to dynamically load main class and IPC handlers
            if (component.hasMain) {
                try {
                    const mainModulePath = path.join(uiBasePath, component.path, this.getMainFileName(component.name));
                    const mainModule = await import(mainModulePath);
                    
                    // Find the main class (usually ends with 'Window')
                    for (const [key, value] of Object.entries(mainModule)) {
                        if (typeof value === 'function' && (key.includes('Window') || key.includes(component.name))) {
                            app.mainClass = value as AppModuleConstructor;
                            logger.debug(`Loaded main class for ${component.name}: ${key}`);
                            break;
                        }
                    }
                } catch (error) {
                    logger.debug(`Could not load main class for ${component.name}:`, error);
                }
            }
            
            if (component.hasIpc) {
                try {
                    const ipcModulePath = path.join(uiBasePath, component.path, this.getIpcFileName(component.name));
                    const ipcModule = await import(ipcModulePath);
                    
                    if (ipcModule.default && this.isValidIpcModule(ipcModule.default)) {
                        app.ipcHandlers = ipcModule.default;
                        logger.debug(`Loaded IPC handlers for ${component.name}`);
                    }
                } catch (error) {
                    logger.debug(`Could not load IPC handlers for ${component.name}:`, error);
                }
            }
            
            // Store the component in the appropriate collection
            if (app.type === 'platform') {
                this.platformComponents.set(app.name, app);
            } else if (app.type === 'widget') {
                this.widgets.set(app.name, app);
            } else {
                this.applications.set(app.name, app);
            }
        }
        
        logger.info(`Dynamic discovery complete: Platform=${this.platformComponents.size}, Apps=${this.applications.size}, Widgets=${this.widgets.size}`);
    }

    /**
     * Scan the UI directory structure for components
     */
    private async scanUIDirectory(basePath: string): Promise<DiscoveredComponent[]> {
        const components: DiscoveredComponent[] = [];
        
        try {
            // Scan platform directory
            const platformPath = path.join(basePath, 'platform');
            if (fs.existsSync(platformPath)) {
                const platformDirs = fs.readdirSync(platformPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                for (const dir of platformDirs) {
                    const component = await this.analyzeComponent(path.join('platform', dir), 'platform', basePath);
                    if (component) components.push(component);
                }
            }
            
            // Scan apps directory
            const appsPath = path.join(basePath, 'apps');
            if (fs.existsSync(appsPath)) {
                const appDirs = fs.readdirSync(appsPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                for (const dir of appDirs) {
                    const component = await this.analyzeComponent(path.join('apps', dir), 'app', basePath);
                    if (component) components.push(component);
                }
            }
            
            // Scan widgets directory (if it exists)
            const widgetsPath = path.join(basePath, 'widgets');
            if (fs.existsSync(widgetsPath)) {
                const widgetDirs = fs.readdirSync(widgetsPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                for (const dir of widgetDirs) {
                    const component = await this.analyzeComponent(path.join('widgets', dir), 'widget', basePath);
                    if (component) components.push(component);
                }
            }
            
        } catch (error) {
            logger.warn('Error scanning UI directory:', error);
        }
        
        return components;
    }

    /**
     * Analyze a component directory to determine what files it has
     */
    private async analyzeComponent(relativePath: string, type: 'platform' | 'app' | 'widget', basePath: string): Promise<DiscoveredComponent | null> {
        const fullPath = path.join(basePath, relativePath);
        const componentName = path.basename(relativePath);
        
        try {
            const files = fs.readdirSync(fullPath);
            
            const hasMain = files.some(file => 
                file.endsWith('.main.ts') || file.endsWith('.main.js') ||
                file === 'main.ts' || file === 'main.js'
            );
            
            const hasIpc = files.some(file => 
                file.endsWith('.ipc.ts') || file.endsWith('.ipc.js') ||
                file === 'ipc.ts' || file === 'ipc.js'
            );
            
            const hasPreload = files.some(file => 
                file === 'preload.ts' || file === 'preload.js'
            );
            
            // Only include components that have at least a main class or IPC handlers
            if (hasMain || hasIpc) {
                return {
                    name: componentName,
                    type,
                    path: relativePath,
                    hasMain,
                    hasIpc,
                    hasPreload
                };
            }
            
        } catch (error) {
            logger.debug(`Could not analyze component ${componentName}:`, error);
        }
        
        return null;
    }

    /**
     * Get the expected main file name for a component
     */
    private getMainFileName(componentName: string): string {
        // Common patterns: component.main.ts, componentname.main.ts, main.ts
        const patterns = [
            `${componentName.toLowerCase()}.main.ts`,
            `${componentName}.main.ts`,
            'main.ts'
        ];
        
        return patterns[0]; // Start with the most common pattern
    }

    /**
     * Get the expected IPC file name for a component
     */
    private getIpcFileName(componentName: string): string {
        // Common patterns: component.ipc.ts, componentname.ipc.ts, ipc.ts
        const patterns = [
            `${componentName.toLowerCase()}.ipc.ts`,
            `${componentName}.ipc.ts`,
            'ipc.ts'
        ];
        
        return patterns[0]; // Start with the most common pattern
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
        logger.info('Destroyed UI discovery service');
    }
} 