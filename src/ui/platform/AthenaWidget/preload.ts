import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Use console.debug for preload script debugging - runs in renderer context
if (process.env.NODE_ENV === 'development') {
  console.debug('--- [AthenaWidget/preload.ts] Loaded ---');
}

// Track conversation update count to reduce log flooding
let conversationUpdateCount = 0;

// Centralized API for main world
contextBridge.exposeInMainWorld('electronAPI', {
    // IPC listeners
    ipcRendererOn: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`--- [AthenaWidget/preload.ts] ipcRendererOn for channel ${channel} ---`);
        }
        const wrappedListener = (event: IpcRendererEvent, ...args: any[]) => {
            if (process.env.NODE_ENV === 'development') {
              // Reduce logging for high-frequency streaming events
              if (channel === 'conversation-update') {
                conversationUpdateCount++;
                // Only log every 50th conversation update to reduce spam
                if (conversationUpdateCount % 50 === 0) {
                  console.debug(`--- [AthenaWidget/preload.ts] Conversation update #${conversationUpdateCount} ---`);
                }
              } else {
                console.debug(`--- [AthenaWidget/preload.ts] Listener triggered for channel ${channel} with args:`, args);
              }
            }
            listener(event, ...args);
        };
        ipcRenderer.on(channel, wrappedListener);
        // Return a cleanup function for React components
        return () => {
            if (process.env.NODE_ENV === 'development') {
              console.debug(`--- [AthenaWidget/preload.ts] Removing listener for channel ${channel} ---`);
            }
            ipcRenderer.removeListener(channel, wrappedListener);
        };
    },
    ipcRendererInvoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    ipcRendererSend: (channel: string, ...args: any[]) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`--- [AthenaWidget/preload.ts] ipcRendererSend on channel ${channel} ---`);
        }
        ipcRenderer.send(channel, ...args);
    },
    // Configuration access
    getConfig: () => ipcRenderer.invoke('athenawidget:get-config')
});

if (process.env.NODE_ENV === 'development') {
  console.debug('--- [AthenaWidget/preload.ts] electronAPI exposed ---');
}
