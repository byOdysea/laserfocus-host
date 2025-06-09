import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Use console.debug for preload script debugging - runs in renderer context
if (process.env.NODE_ENV === 'development') {
  console.debug('--- [AthenaWidget/preload.ts] Loaded ---');
}

// Track conversation update count to reduce log flooding
let conversationUpdateCount = 0;

contextBridge.exposeInMainWorld('electronAPI', {
  ipcRendererSend: (channel: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`--- [AthenaWidget/preload.ts] ipcRendererSend to channel ${channel} with args:`, args);
    }
    ipcRenderer.send(channel, ...args);
  },
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
    // Return a cleanup function
    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`--- [AthenaWidget/preload.ts] Removing listener for channel ${channel} ---`);
      }
      ipcRenderer.removeListener(channel, wrappedListener);
    };
  }
});

if (process.env.NODE_ENV === 'development') {
  console.debug('--- [AthenaWidget/preload.ts] electronAPI exposed ---');
}
