import type { IpcRendererEvent } from 'electron';

export interface ElectronAPI {
  ipcRendererSend: (channel: string, ...args: any[]) => void;
  ipcRendererOn: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => () => void; // Returns a cleanup function
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
