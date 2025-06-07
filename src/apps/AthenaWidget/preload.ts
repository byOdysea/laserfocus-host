import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

console.log('--- [AthenaWidget/preload.ts] Loaded ---');

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRendererSend: (channel: string, ...args: any[]) => {
    console.log(`--- [AthenaWidget/preload.ts] ipcRendererSend to channel ${channel} with args:`, args);
    ipcRenderer.send(channel, ...args);
  },
  ipcRendererOn: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    console.log(`--- [AthenaWidget/preload.ts] ipcRendererOn for channel ${channel} ---`);
    const wrappedListener = (event: IpcRendererEvent, ...args: any[]) => {
        console.log(`--- [AthenaWidget/preload.ts] Listener triggered for channel ${channel} with args:`, args);
        listener(event, ...args);
    };
    ipcRenderer.on(channel, wrappedListener);
    // Return a cleanup function
    return () => {
      console.log(`--- [AthenaWidget/preload.ts] Removing listener for channel ${channel} ---`);
      ipcRenderer.removeListener(channel, wrappedListener);
    };
  }
});

console.log('--- [AthenaWidget/preload.ts] electronAPI exposed ---');
