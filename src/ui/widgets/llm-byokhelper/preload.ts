import { contextBridge, ipcRenderer } from 'electron';

export interface LlmByokhelperAPI {
    exampleAction: (data: any) => Promise<{ success: boolean; result?: any; error?: string }>;
    focusWindow: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('llmByokhelperAPI', {
    exampleAction: (data: any) => ipcRenderer.invoke('llm-byokhelper:example-action', data),
    focusWindow: () => ipcRenderer.send('llm-byokhelper:focus'),
} as LlmByokhelperAPI);

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        llmByokhelperAPI: LlmByokhelperAPI;
    }
}