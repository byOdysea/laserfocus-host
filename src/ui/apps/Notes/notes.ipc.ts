import { IpcMain } from 'electron';
import { CanvasEngine } from '@core/engine/canvas-engine';
import { AppIpcModule, AppMainProcessInstances } from '@core/bridge/types';
        import { NotesWindow } from '@ui/apps/notes/notes.main';
import * as logger from '@utils/logger';

const NotesIpcHandlers: AppIpcModule = {
    moduleId: 'notes',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        canvasEngine: CanvasEngine,
        appInstance: NotesWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[notesIPC] Registering notes IPC handlers');

        // Example: Handle app-specific events
        ipcMain.handle('notes:example-action', async (event, data) => {
            try {
                logger.info(`[notesIPC] Example action called with:`, data);
                // Add your app-specific logic here
                return { success: true, result: 'Example result' };
            } catch (error) {
                logger.error('[notesIPC] Error in example action:', error);
                return { success: false, error: 'Failed to execute action' };
            }
        });

        // Focus the app window
        ipcMain.on('notes:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[notesIPC] notes IPC handlers registered successfully');
    }
};

export default NotesIpcHandlers;