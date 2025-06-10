import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import { NotesWindow } from '@ui/apps/notes/notes.main';
import * as logger from '@utils/logger';
import { IpcMain } from 'electron';

const NotesIpcHandlers: AppIpcModule = {
    moduleId: 'Notes',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: NotesWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[NotesIPC] Registering notes IPC handlers');

        // Example: Handle app-specific events
        ipcMain.handle('notes:example-action', async (event, data) => {
            try {
                logger.info(`[NotesIPC] Example action called with:`, data);
                // Add your app-specific logic here
                return { success: true, result: 'Example result' };
            } catch (error) {
                logger.error('[NotesIPC] Error in example action:', error);
                return { success: false, error: 'Failed to execute action' };
            }
        });

        // Focus the app window
        ipcMain.on('notes:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[NotesIPC] notes IPC handlers registered successfully');
    }
};

export default NotesIpcHandlers;