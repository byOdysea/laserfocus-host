// src/InputPill/preload.ts
console.log('--- [InputPill/preload.ts] SCRIPT STARTED ---');
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRendererSend: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  ipcRendererOn: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
