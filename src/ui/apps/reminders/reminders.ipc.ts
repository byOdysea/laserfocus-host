import { IpcMain } from 'electron';
import { CanvasEngine } from '@core/engine/canvas-engine';
import { AppIpcModule, AppMainProcessInstances } from '@core/bridge/types';
        import { RemindersWindow } from '@ui/apps/reminders/reminders.main';
import * as logger from '@utils/logger';

const RemindersIpcHandlers: AppIpcModule = {
    moduleId: 'reminders',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        canvasEngine: CanvasEngine,
        appInstance: RemindersWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[remindersIPC] Registering reminders IPC handlers');

        // Example: Handle app-specific events
        ipcMain.handle('reminders:example-action', async (event, data) => {
            try {
                logger.info(`[remindersIPC] Example action called with:`, data);
                // Add your app-specific logic here
                return { success: true, result: 'Example result' };
            } catch (error) {
                logger.error('[remindersIPC] Error in example action:', error);
                return { success: false, error: 'Failed to execute action' };
            }
        });

        // Focus the app window
        ipcMain.on('reminders:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[remindersIPC] reminders IPC handlers registered successfully');
    }
};

export default RemindersIpcHandlers;