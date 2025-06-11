
export interface ElectronAPI {
  ipcRendererSend: (channel: string, ...args: any[]) => void;
  ipcRendererOn: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void; // Returns a cleanup function
  ipcRendererInvoke: (channel: string, ...args: any[]) => Promise<any>;
  getConfig: () => Promise<any>;
  getGpuInfo: () => Promise<any>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
