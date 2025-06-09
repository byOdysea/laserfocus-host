// src/ui/platform/AthenaWidget/athenawidget.ipc.ts
import logger from '@utils/logger';
import { BrowserWindow } from 'electron';

export function registerHandlers(athenaWidgetWindow: BrowserWindow): void {
    logger.info('[AthenaWidget.ipc] Registering AthenaWidget as conversation monitor');
    
    // AthenaWidget now receives conversation updates directly via webContents.send()
    // from the Bridge Service. No IPC event handlers needed since it's pure monitoring.
    // The UI will listen for 'conversation-update' events in the renderer process.
    
    logger.info('[AthenaWidget.ipc] AthenaWidget conversation monitor ready (direct webContents communication)');
}

export const moduleId = "AthenaWidget";
export { registerHandlers as registerMainProcessHandlers };

// Default export for app registry
const AthenaWidgetIpcHandlers = {
    moduleId: "AthenaWidget",
    registerMainProcessHandlers: registerHandlers
};

export default AthenaWidgetIpcHandlers;
