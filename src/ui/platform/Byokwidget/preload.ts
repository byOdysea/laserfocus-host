import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { AgentStatusInfo, AgentConnectionStatus } from '@core/agent/athena-agent';

export interface ByokwidgetAPI {
    // API Key management
    getApiKey: () => Promise<{ success: boolean; apiKey?: string; hasApiKey?: boolean; error?: string }>;
    getFullApiKey: () => Promise<{ success: boolean; apiKey?: string; error?: string }>;
    saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
    deleteApiKey: () => Promise<{ success: boolean; error?: string }>;
    // Removed API key testing - connection status comes from agent
    
    // Configuration management
    getConfig: () => Promise<{ success: boolean; config?: any; error?: string }>;
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
    getAgentProviderStatus: () => Promise<AgentStatusInfo>;
    
    // Window management
    focusWindow: () => void;
    openSettings: () => Promise<{ success: boolean; error?: string }>;

    // Event listeners
    onConfigChange: (callback: (newConfig: any) => void) => () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('byokwidgetAPI', {
    // Get current configuration
    getConfig: () => ipcRenderer.invoke('byokwidget:get-config'),
    
    // Get full API key for display
    getApiKey: () => ipcRenderer.invoke('byokwidget:get-api-key'),
    
    // Save new API key
    saveApiKey: (apiKey: string) => ipcRenderer.invoke('byokwidget:save-api-key', apiKey),
    
    // Get connection status (old method, to be removed from component)
    getStatus: () => ipcRenderer.invoke('byokwidget:get-status'),

    // Get detailed agent provider status
    getAgentProviderStatus: () => ipcRenderer.invoke('athena:provider-status'),
    
    // Listen for real-time config changes
    onConfigChange: (callback: (newConfig: any) => void) => {
        const subscription = (event: IpcRendererEvent, newConfig: any) => callback(newConfig);
        ipcRenderer.on('config-changed', subscription);
        return () => ipcRenderer.removeListener('config-changed', subscription);
    },

    // Focus window
    focus: () => ipcRenderer.send('byokwidget:focus'),
});

// Listen for configuration change notifications from main process
ipcRenderer.on('config-changed', () => {
    // Dispatch a custom event to notify the React component
    window.dispatchEvent(new CustomEvent('config-updated'));
});

declare global {
    interface Window {
        byokwidgetAPI: ByokwidgetAPI;
    }
}