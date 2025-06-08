// Canvas Engine Type Definitions
// Centralized window and UI component interfaces

export interface CanvasWindowState {
    id: string;
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    type?: 'browser' | 'platform' | 'app' | 'widget';
    componentName?: string;
}

export interface CanvasState {
    windows: CanvasWindowState[];
}

export interface LayoutConfig {
    screenEdgePadding: number;
    windowGap: number;
    menuBarHeight: number;
    minWindowWidth: number;
}

export interface LLMConfig {
    provider: 'google' | 'openai' | 'anthropic' | 'custom';
    apiKey: string;
    modelName: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string; // For custom providers
}

export interface PlatformComponentConfig {
    name: string;
    MainClass: any;
    defaultPosition?: { x: number; y: number };
    defaultSize?: { width: number; height: number };
    behavior: 'auto-start' | 'on-demand';
    layer: 'system' | 'user';
    fullPath: string;
} 