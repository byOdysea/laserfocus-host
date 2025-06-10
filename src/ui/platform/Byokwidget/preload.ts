import { contextBridge, ipcRenderer } from 'electron';

export interface ByokwidgetAPI {
    // API Key management
    getApiKey: () => Promise<{ success: boolean; apiKey?: string; hasApiKey?: boolean; error?: string }>;
    getFullApiKey: () => Promise<{ success: boolean; apiKey?: string; error?: string }>;
    saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
    // Removed API key testing - connection status comes from agent
    
    // Configuration management
    getConfig: () => Promise<{ success: boolean; config?: any; error?: string }>;
    forceConfigRefresh: () => Promise<{ success: boolean; error?: string }>;
    updateProvider: (updates: {
        service?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
        baseUrl?: string;
    }) => Promise<{ success: boolean; error?: string }>;
    updateApp: (updates: {
        logLevel?: string;
        theme?: string;
    }) => Promise<{ success: boolean; error?: string }>;
    
    // Model management
    getModels: (provider: string) => Promise<{ success: boolean; models?: Array<{value: string; label: string}>; error?: string }>;
    
    // Status monitoring
    getStatus: () => Promise<{ success: boolean; status?: any; error?: string }>;
    
    // Window management
    focusWindow: () => void;
    openSettings: () => Promise<{ success: boolean; error?: string }>;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('byokwidgetAPI', {
    // API Key management
    getApiKey: () => ipcRenderer.invoke('byokwidget:get-api-key'),
    getFullApiKey: () => ipcRenderer.invoke('byokwidget:get-full-api-key'),
    saveApiKey: (apiKey: string) => ipcRenderer.invoke('byokwidget:save-api-key', apiKey),
    // Removed API key testing - connection status comes from agent
    
    // Configuration management
    getConfig: () => ipcRenderer.invoke('byokwidget:get-config'),
    forceConfigRefresh: () => ipcRenderer.invoke('byokwidget:force-config-refresh'),
    updateProvider: (updates: any) => ipcRenderer.invoke('byokwidget:update-provider', updates),
    updateApp: (updates: any) => ipcRenderer.invoke('byokwidget:update-app', updates),
    
    // Model management
    getModels: (provider: string) => ipcRenderer.invoke('byokwidget:get-models', provider),
    
    // Status monitoring
    getStatus: () => ipcRenderer.invoke('byokwidget:get-status'),
    
    // Window management
    focusWindow: () => ipcRenderer.send('byokwidget:focus'),
    openSettings: () => ipcRenderer.invoke('byokwidget:open-settings'),
} as ByokwidgetAPI);

// Listen for configuration change notifications from main process
ipcRenderer.on('config-changed', () => {
    // Dispatch a custom event to notify the React component
    window.dispatchEvent(new CustomEvent('config-updated'));
});

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        byokwidgetAPI: ByokwidgetAPI;
    }
}