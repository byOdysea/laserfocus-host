// src/ui/platform/AthenaWidget/athenawidget.ipc.ts
import { AppIpcModule } from '@core/platform/ipc/types';
import logger from '@utils/logger';
import { IpcMain } from 'electron';

const AthenaWidgetIpcHandlers: AppIpcModule = {
    moduleId: 'AthenaWidget',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: any
    ) => {
        logger.info('[AthenaWidget.ipc] Registering simple AthenaWidget IPC handlers.');
        
        // No specific handlers are needed anymore for this module,
        // as all communication is handled by the AgentBridge and broadcast to the widget.
        // We can add handlers here in the future if the widget needs to send data back to main.

        // Return an empty cleanup function
        return () => {
            logger.info('[AthenaWidget.ipc] Unregistered AthenaWidget IPC handlers.');
        };
    }
};

export default AthenaWidgetIpcHandlers;
