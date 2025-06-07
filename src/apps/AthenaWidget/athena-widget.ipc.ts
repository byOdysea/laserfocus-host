// src/apps/AthenaWidget/athena-widget.ipc.ts
import { IpcMain, IpcMainEvent } from 'electron';
import { AppIpcModule, AppMainProcessInstances } from '../../core/bridge/types';
import * as logger from '../../utils/logger';
import { AthenaWidgetWindow } from './athena-widget.main'; // Specific type for appInstance

export const ATHENA_WIDGET_IPC_EVENTS = {
    USER_QUERY: 'ipc-main-event:athena-widget:user-query',
    AGENT_RESPONSE: 'ipc-main-event:athena-widget:agent-response',
    AGENT_ERROR: 'ipc-main-event:athena-widget:agent-error',
};

const AthenaWidgetIpcHandlers: AppIpcModule = {
    moduleId: 'athenaWidget',

    registerMainProcessHandlers: (
        ipcMainInstance: IpcMain,
        canvasEngine: any, // Pragmatic: support both V1 and V2
        appInstance: AthenaWidgetWindow, // Type assertion for clarity
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info(`[AthenaWidget.ipc] Registering IPC handlers for ${AthenaWidgetIpcHandlers.moduleId}`);
        
        logger.info(`[AthenaWidget.ipc] Canvas Engine detected for AthenaWidget handlers`);

        // Handler for user queries
        ipcMainInstance.on(ATHENA_WIDGET_IPC_EVENTS.USER_QUERY, (event: IpcMainEvent) => { // 'event' will be the actual query string
            const query = event as any as string; // Cast to string
            logger.info(`[AthenaWidget.ipc] Listener for ${ATHENA_WIDGET_IPC_EVENTS.USER_QUERY} triggered. Actual query received:`, query);
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                logger.info(`[AthenaWidget.ipc] Received '${ATHENA_WIDGET_IPC_EVENTS.USER_QUERY}' event with query: "${query}"`);
                appInstance.sendConversationUpdate('user', query);
            } else {
                logger.warn(`[AthenaWidget.ipc] ${AthenaWidgetIpcHandlers.moduleId} instance not available or destroyed. Cannot display user query.`);
            }
        });

        // Handler for agent responses
        ipcMainInstance.on(ATHENA_WIDGET_IPC_EVENTS.AGENT_RESPONSE, (event: IpcMainEvent) => { // 'event' will be the actual responseContent
            const responseContent = event as any as (string | object); // Cast
            logger.info(`[AthenaWidget.ipc] Listener for ${ATHENA_WIDGET_IPC_EVENTS.AGENT_RESPONSE} triggered. Actual responseContent received:`, responseContent);
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                const messageToSend = typeof responseContent === 'string' ? responseContent : JSON.stringify(responseContent);
                logger.info(`[AthenaWidget.ipc] Received '${ATHENA_WIDGET_IPC_EVENTS.AGENT_RESPONSE}' event, processed content:`, messageToSend);
                appInstance.sendConversationUpdate('agent', messageToSend);
            } else {
                logger.warn(`[AthenaWidget.ipc] ${AthenaWidgetIpcHandlers.moduleId} instance not available or destroyed. Cannot display agent response.`);
            }
        });
        
        // Handler for agent errors
        ipcMainInstance.on(ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR, (event: IpcMainEvent) => { // 'event' will be the actual errorMessage
            const errorMessage = event as any as string; // Cast
            logger.info(`[AthenaWidget.ipc] Listener for ${ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR} triggered. Actual errorMessage received:`, errorMessage);
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                logger.info(`[AthenaWidget.ipc] Received '${ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR}' event with message: "${errorMessage}"`);
                appInstance.sendConversationUpdate('agent', errorMessage); // Display error as an agent message
            } else {
                logger.warn(`[AthenaWidget.ipc] ${AthenaWidgetIpcHandlers.moduleId} instance not available or destroyed. Cannot display agent error.`);
            }
        });

        logger.info(`[AthenaWidget.ipc] IPC handlers for ${AthenaWidgetIpcHandlers.moduleId} registered to listen for generic events.`);
    }
};

export default AthenaWidgetIpcHandlers;
