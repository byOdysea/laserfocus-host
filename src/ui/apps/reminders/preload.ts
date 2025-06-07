import { contextBridge, ipcRenderer } from 'electron';

export interface remindersAPI {
    exampleAction: (data: any) => Promise<{ success: boolean; result?: any; error?: string }>;
    focusWindow: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('remindersAPI', {
    exampleAction: (data: any) => ipcRenderer.invoke('reminders:example-action', data),
    focusWindow: () => ipcRenderer.send('reminders:focus'),
} as remindersAPI);

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        remindersAPI: remindersAPI;
    }
}