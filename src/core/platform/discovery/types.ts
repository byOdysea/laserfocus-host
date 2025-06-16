/**
 * UI Component Discovery Types
 * 
 * Terminology:
 * - UI Component: Umbrella term for everything in src/ui
 * - App components: Full-blown React web apps (src/ui/apps/)
 * - Platform components: UI components for Electron app (src/ui/platform/)
 * - Widgets: Small standalone UI apps (future category)
 */

import { BrowserWindow, Display } from 'electron';
import { AppIpcModule } from '../ipc/types';

export type UIComponentType = 'platform' | 'app' | 'widget';

export interface AppModuleConstructor {
    new (
        primaryDisplay: Display,
        viteDevServerUrl: string | undefined,
        preloadPath: string
    ): any;
}

export interface UIComponentModule {
    name: string;
    type: UIComponentType;
    fullPath: string;
    actualPath: string;
    mainClass?: AppModuleConstructor;
    ipcHandlers?: AppIpcModule;
    instance?: {
        window?: BrowserWindow;
        init?: () => void;
    };
}

export interface UIComponentRegistry {
    mainClasses: Map<string, AppModuleConstructor>;
    ipcModules: Map<string, AppIpcModule>;
}

export interface UIComponentInfo {
    name: string;
    type: UIComponentType;
    path: string;
    hasMain: boolean;
    hasIpc: boolean;
    hasPreload: boolean;
}

export interface UIDiscoveryConfig {
    uiDir: string;
    primaryDisplay: Display;
    viteDevServerUrl?: string;
    preloadBasePath: string;
}

// Legacy type alias for backward compatibility
export type AppModule = UIComponentModule;
