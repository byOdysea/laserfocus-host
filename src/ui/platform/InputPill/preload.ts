// src/InputPill/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Use console.debug for preload script debugging - runs in renderer context
if (process.env.NODE_ENV === 'development') {
  console.debug('--- [InputPill/preload.ts] SCRIPT STARTED ---');
}

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRendererSend: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  ipcRendererOn: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
