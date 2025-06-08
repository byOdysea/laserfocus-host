import { contextBridge, ipcRenderer } from 'electron';

export interface ByokwidgetAPI {
    getApiKey: () => Promise<{ success: boolean; apiKey?: string; error?: string }>;
    saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
    testApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
    testStoredKey: () => Promise<{ success: boolean; error?: string }>;
    focusWindow: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('byokwidgetAPI', {
    getApiKey: () => ipcRenderer.invoke('byokwidget:get-api-key'),
    saveApiKey: (apiKey: string) => ipcRenderer.invoke('byokwidget:save-api-key', apiKey),
    testApiKey: (apiKey: string) => ipcRenderer.invoke('byokwidget:test-api-key', apiKey),
    testStoredKey: () => ipcRenderer.invoke('byokwidget:test-stored-key'),
    focusWindow: () => ipcRenderer.send('byokwidget:focus'),
} as ByokwidgetAPI);

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        byokwidgetAPI: ByokwidgetAPI;
    }
}