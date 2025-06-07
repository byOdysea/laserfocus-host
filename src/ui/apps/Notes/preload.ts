import { contextBridge, ipcRenderer } from 'electron';

export interface notesAPI {
    exampleAction: (data: any) => Promise<{ success: boolean; result?: any; error?: string }>;
    focusWindow: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('notesAPI', {
    exampleAction: (data: any) => ipcRenderer.invoke('notes:example-action', data),
    focusWindow: () => ipcRenderer.send('notes:focus'),
} as notesAPI);

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        notesAPI: notesAPI;
    }
}