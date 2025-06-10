import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import { RemindersWindow } from '@ui/apps/reminders/reminders.main';
import * as logger from '@utils/logger';
import { IpcMain } from 'electron';

const RemindersIpcHandlers: AppIpcModule = {
    moduleId: 'Reminders',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: RemindersWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[RemindersIPC] Registering reminders IPC handlers');

        // Example: Handle app-specific events
        ipcMain.handle('reminders:example-action', async (event, data) => {
            try {
                logger.info(`[RemindersIPC] Example action called with:`, data);
                // Add your app-specific logic here
                return { success: true, result: 'Example result' };
            } catch (error) {
                logger.error('[RemindersIPC] Error in example action:', error);
                return { success: false, error: 'Failed to execute action' };
            }
        });

        // Focus the app window
        ipcMain.on('reminders:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[RemindersIPC] reminders IPC handlers registered successfully');
    }
};

export default RemindersIpcHandlers;