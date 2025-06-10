// src/ui/platform/AthenaWidget/athenawidget.ipc.ts
import { config } from '@core/infrastructure/config/configuration-manager';
import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import logger from '@utils/logger';
import { BrowserWindow, IpcMain } from 'electron';

export function registerHandlers(athenaWidgetWindow: BrowserWindow): void {
    logger.info('[AthenaWidget.ipc] Registering AthenaWidget as conversation monitor');
    
    // AthenaWidget now receives conversation updates directly via webContents.send()
    // from the Bridge Service. No IPC event handlers needed since it's pure monitoring.
    // The UI will listen for 'conversation-update' events in the renderer process.
    
    logger.info('[AthenaWidget.ipc] AthenaWidget conversation monitor ready (direct webContents communication)');
}

const AthenaWidgetIpcHandlers: AppIpcModule = {
    moduleId: 'AthenaWidget',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: any, // AthenaWidgetWindow
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[AthenaWidget.ipc] Registering AthenaWidget IPC handlers');
        
        // Get current configuration for UI settings
        ipcMain.handle('athenawidget:get-config', async () => {
            try {
                const currentConfig = config.get();
                return { 
                    success: true, 
                    config: {
                        enableToolPills: currentConfig.ui.enableToolPills
                    }
                };
            } catch (error) {
                logger.error('[AthenaWidget.ipc] Error getting config:', error);
                return { success: false, error: 'Failed to get configuration' };
            }
        });
        
        // Set up configuration change notifications
        config.onChange(async (newConfig) => {
            // Send configuration changes to the AthenaWidget renderer
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.window.webContents.send('config-changed', {
                    enableToolPills: newConfig.ui.enableToolPills
                });
                logger.debug('[AthenaWidget.ipc] Sent configuration update to renderer');
            }
        });
        
        logger.info('[AthenaWidget.ipc] AthenaWidget IPC handlers registered successfully');
    }
};

export default AthenaWidgetIpcHandlers;
