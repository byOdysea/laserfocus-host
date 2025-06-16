import { createLogger } from '@/lib/utils/logger';
import { ipcMain } from 'electron';
import * as path from 'path';
import { discoverUIComponents, loadUIComponentModules } from './component-discovery';
import { classifyAppType, getAppPath, isValidIpcModule, loadUIRegistry } from './component-registry';
import {
    UIComponentModule,
    UIComponentRegistry,
    UIDiscoveryConfig
} from './types';

const logger = createLogger('[UIDiscovery]');

export class UIDiscoveryService {
    private uiComponents: Map<string, UIComponentModule> = new Map();

    constructor(private config: UIDiscoveryConfig) {}

    async discoverAndInitializeUIComponents(): Promise<{
        uiComponentInstances: Map<string, any>;
        uiComponentModules: UIComponentModule[];
    }> {
        await this.discoverUIComponents();
        await this.initializeUIComponents();
        return this.getRegistrationData();
    }

    async initializeUIWindow(windowName: string): Promise<UIComponentModule | null> {
        const uiComponent = this.uiComponents.get(windowName);
        if (!uiComponent) {
            logger.warn(`UI Window ${windowName} not found`);
            return null;
        }
        if (uiComponent.instance) {
            if (uiComponent.instance.window && uiComponent.instance.window.isDestroyed()) {
                uiComponent.instance = undefined;
            } else {
                return uiComponent;
            }
        }
        if (!uiComponent.mainClass) {
            logger.warn(`UI Window ${windowName} has no main class`);
            return null;
        }
        try {
            const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.config;
            const preloadPath = path.join(preloadBasePath, `../ui/${uiComponent.actualPath}/preload.js`);
            const instance = new uiComponent.mainClass(primaryDisplay, viteDevServerUrl, preloadPath);
            instance.init?.();
            uiComponent.instance = instance;
            if (uiComponent.ipcHandlers && isValidIpcModule(uiComponent.ipcHandlers)) {
                const { uiComponentInstances } = this.getRegistrationData();
                const moduleId = uiComponent.ipcHandlers.moduleId || windowName;
                uiComponentInstances.set(moduleId, instance);
                uiComponent.ipcHandlers.registerMainProcessHandlers(ipcMain, instance, uiComponentInstances);
                if (instance.window && uiComponent.ipcHandlers.unregisterMainProcessHandlers) {
                    instance.window.on('closed', () => {
                        uiComponent.ipcHandlers!.unregisterMainProcessHandlers!(ipcMain, instance);
                    });
                }
            }
            return uiComponent;
        } catch (error) {
            logger.error(`Failed to initialize ${uiComponent.type} ${windowName}:`, error);
            return null;
        }
    }

    private async discoverUIComponents(): Promise<void> {
        let registry = await loadUIRegistry();
        if (registry) {
            logger.info('Using auto-generated UI component registry...');
            await this.discoverFromRegistry(registry);
        } else {
            logger.info('Auto-generated registry not available, using dynamic discovery...');
            registry = { mainClasses: new Map(), ipcModules: new Map() };
            await this.discoverUIComponentsDynamically(registry);
        }
        logger.info(`Discovered ${this.uiComponents.size} UI components:`, Array.from(this.uiComponents.keys()));
    }

    private async discoverFromRegistry(registry: UIComponentRegistry): Promise<void> {
        if (!registry) return;
        // First, collect all unique component names from both mainClasses and ipcModules
        const allNames = new Set([
            ...Array.from(registry.mainClasses.keys()),
            ...Array.from(registry.ipcModules.keys()),
        ]);
        for (const name of allNames) {
            const mainClass = registry.mainClasses.get(name);
            const ipcHandlers = registry.ipcModules.get(name);
            const uiComponent: UIComponentModule = {
                name,
                type: await classifyAppType(name),
                fullPath: await getAppPath(name),
                actualPath: await getAppPath(name),
                ...(mainClass ? { mainClass } : {}),
                ...(ipcHandlers && isValidIpcModule(ipcHandlers) ? { ipcHandlers } : {}),
            };
            this.storeComponent(name, uiComponent);
        }
    }

    private async discoverUIComponentsDynamically(registry: UIComponentRegistry): Promise<void> {
        const uiBasePath = path.join(process.cwd(), this.config.uiDir);
        const discoveredComponents = await discoverUIComponents(uiBasePath);
        for (const component of discoveredComponents) {
            const modules = await loadUIComponentModules(component, uiBasePath);
            const uiComponent: UIComponentModule = {
                name: component.name,
                type: component.type,
                fullPath: component.path,
                actualPath: component.path,
                ...modules,
            };
            this.storeComponent(uiComponent.name, uiComponent);
        }
    }

    private storeComponent(name: string, uiComponent: UIComponentModule): void {
        this.uiComponents.set(name, uiComponent);
    }

    private async initializeUIComponents(): Promise<void> {
        const { primaryDisplay, viteDevServerUrl, preloadBasePath } = this.config;
        for (const [appName, uiComponent] of this.uiComponents) {
            // Only initialize platform components by default
            if (uiComponent.mainClass && uiComponent.type === 'platform') {
                try {
                    const preloadPath = path.join(preloadBasePath, `../ui/${uiComponent.actualPath}/preload.js`);
                    const instance = new uiComponent.mainClass(primaryDisplay, viteDevServerUrl, preloadPath);
                    instance.init?.();
                    uiComponent.instance = instance;
                    
                    // Register IPC handlers for this component
                    if (uiComponent.ipcHandlers && isValidIpcModule(uiComponent.ipcHandlers)) {
                        const { uiComponentInstances } = this.getRegistrationData();
                        const moduleId = uiComponent.ipcHandlers.moduleId || appName;
                        uiComponentInstances.set(moduleId, instance);
                        uiComponent.ipcHandlers.registerMainProcessHandlers(ipcMain, instance, uiComponentInstances);
                        if (instance.window && uiComponent.ipcHandlers.unregisterMainProcessHandlers) {
                            instance.window.on('closed', () => {
                                uiComponent.ipcHandlers!.unregisterMainProcessHandlers!(ipcMain, instance);
                            });
                        }
                    }
                    
                    // Show platform components by default
                    if (instance && typeof instance.show === 'function') {
                        logger.info(`Showing platform component: ${appName}`);
                        instance.show();
                    }
                } catch (error) {
                    logger.error(`Failed to initialize UI component ${appName}:`, error);
                }
            } else if (uiComponent.type !== 'platform') {
                // For non-platform components, just register their IPC handlers without creating instances
                if (uiComponent.ipcHandlers && isValidIpcModule(uiComponent.ipcHandlers)) {
                    logger.info(`Registering IPC handlers for non-platform component: ${appName}`);
                    // We don't create an instance, but we still register the IPC handlers
                    // This allows the component to be opened on demand later
                }
            }
        }
        
        logger.info(`Initialized ${this.getPlatformComponents().length} platform components for startup`);
    }

    private getRegistrationData(): {
        uiComponentInstances: Map<string, any>;
        uiComponentModules: UIComponentModule[];
    } {
        const uiComponentInstances: Map<string, any> = new Map();
        const uiComponentModules: UIComponentModule[] = [];
        this.uiComponents.forEach((uiComponent, name) => {
            if (uiComponent.instance) uiComponentInstances.set(name, uiComponent.instance);
            if (uiComponent.ipcHandlers) uiComponentModules.push(uiComponent);
        });
        return { uiComponentInstances, uiComponentModules };
    }

    getUIComponentInstance(appName: string): any | undefined {
        const uiComponent = this.uiComponents.get(appName);
        return uiComponent?.instance;
    }

    getAllUIComponents(): string[] {
        return Array.from(this.uiComponents.keys());
    }

    getPlatformComponents(): string[] {
        return Array.from(this.uiComponents.entries())
            .filter(([_, component]) => component.type === 'platform')
            .map(([name, _]) => name);
    }

    async reloadRegistry(): Promise<void> {
        try {
            delete require.cache[require.resolve('./app-registry')];
            const runningUIComponents = new Map(this.uiComponents);
            this.uiComponents.clear();
            await this.discoverUIComponents();
            for (const [name, component] of runningUIComponents) {
                if (component.instance && !component.instance.window?.isDestroyed()) {
                    this.uiComponents.set(name, component);
                }
            }
        } catch (error) {
            logger.error('Failed to reload registry:', error);
            throw error;
        }
    }
}

let uiDiscoveryService: UIDiscoveryService | null = null;

export function setUIDiscoveryService(service: UIDiscoveryService): void {
    uiDiscoveryService = service;
}

export function getUIDiscoveryService(): UIDiscoveryService | null {
    return uiDiscoveryService;
}

export function destroyUIDiscoveryService(): void {
    if (uiDiscoveryService) {
        uiDiscoveryService = null;
        logger.info('Destroyed UI discovery service');
    }
}
