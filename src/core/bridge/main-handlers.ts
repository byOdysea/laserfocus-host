// src/core/bridge/main-handlers.ts
import { ipcMain, IpcMainEvent } from 'electron';
import * as logger from '../../utils/logger';
import { CanvasEngine } from '../engine/canvas-engine';
import { InputPill } from '../../apps/InputPill/input-pill.main';
import { AthenaWidgetWindow } from '../../apps/AthenaWidget/athena-widget.main';
import { ATHENA_WIDGET_IPC_EVENTS } from '../../apps/AthenaWidget/athena-widget.ipc'; // Added import
import { AIMessage } from '@langchain/core/messages'; // For type casting

export function registerMainProcessEventHandlers(
    canvasEngine: CanvasEngine,
    inputPillInstance?: InputPill, 
    athenaWidgetInstance?: AthenaWidgetWindow
): void {
    ipcMain.on('run-agent', async (event: IpcMainEvent, query: string) => {
        logger.info("[ipcMain] RUN_AGENT_CALLBACK_STARTED_CHECKPOINT"); // Moved to be the very first log
        logger.info(`[ipcMain] Received 'run-agent' with query: "${query}"`);

        if (!canvasEngine) {
            logger.error("[ipcMain] CanvasEngine not initialized! Cannot run agent.");
            const errorMsg = "Error: Agent not initialized.";
            // Send error back to the original requester (likely InputPill)
            event.sender.send('agent-response', errorMsg);
            logger.debug(`[main-handlers] Checking athenaWidgetInstance before emitting AGENT_ERROR (CanvasEngine not init). Is defined: ${!!athenaWidgetInstance}`);
            if (athenaWidgetInstance) {
                 logger.debug(`[main-handlers] Emitting ${ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR} (CanvasEngine not init) with message: "${errorMsg}"`);
                 ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR, errorMsg);
            } else {
                logger.warn('[main-handlers] athenaWidgetInstance is falsy. Skipping AGENT_ERROR (CanvasEngine not init) emit.');
            }
            return;
        }

        // logger.info("[ipcMain] PRE_TRY_BLOCK_CHECKPOINT_IN_RUN_AGENT"); // This is now effectively handled by the log at the start of the callback
        try {
            logger.info("[main-handlers] TRY_BLOCK_ENTERED_FOR_RUN_AGENT (now info)"); // Changed to info
            if (!athenaWidgetInstance) {
                logger.error("[ipcMain] AthenaWidget not initialized!");
                // Optionally send error back to the original requester
                event.sender.send('agent-response', "Error: AthenaWidget not available.");
                // No specific Athena error event here as AthenaWidget itself is the issue.
                return;
            }
            if (!inputPillInstance || !inputPillInstance.window || inputPillInstance.window.isDestroyed()) {
                logger.error("[ipcMain] InputPill not initialized or window destroyed!");
                // AthenaWidget might still be able to display this error
                logger.debug(`[main-handlers] Checking athenaWidgetInstance before emitting AGENT_ERROR (InputPill not init). Is defined: ${!!athenaWidgetInstance}`);
                if (athenaWidgetInstance) { // Check if athenaWidgetInstance exists before emitting
                    const pillErrorMsg = "Error: InputPill not available.";
                    logger.debug(`[main-handlers] Emitting ${ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR} (InputPill not init) with message: "${pillErrorMsg}"`);
                    ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR, pillErrorMsg);
                } else {
                    logger.warn('[main-handlers] athenaWidgetInstance is falsy. Skipping AGENT_ERROR (InputPill not init) emit.');
                }
                return;
            }

            logger.info(`[main-handlers] Checking athenaWidgetInstance before emitting USER_QUERY (now info). Is defined: ${!!athenaWidgetInstance}`); // Changed to info
            if (athenaWidgetInstance) { // Check if athenaWidgetInstance exists before emitting
                logger.info(`[main-handlers] Emitting ${ATHENA_WIDGET_IPC_EVENTS.USER_QUERY} (now info) with query: "${query}"`); // Changed to info
                ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.USER_QUERY, query);
            } else {
                logger.warn('[main-handlers] athenaWidgetInstance is falsy. Skipping USER_QUERY emit.');
            }
            // Inform the original requester (InputPill) that processing has started
            logger.info("[main-handlers] About to send 'agent-processing' to InputPill.");
            event.sender.send('agent-processing');

            const agentResponseState = await canvasEngine.invoke(query);
            logger.info(`[ipcMain] Agent final response state received.`);
            const responseMessagesForDebug = agentResponseState && agentResponseState.messages ? agentResponseState.messages : 'No messages array found in agentResponseState';
            logger.debug('[ipcMain] Agent response messages for debug:', responseMessagesForDebug);
            // logger.debug(`[ipcMain] Agent final response state: ${JSON.stringify(agentResponseState, null, 2)}`); // Temporarily commented out
            
            let responseContent = "No direct response from agent.";
            if (agentResponseState && agentResponseState.messages && Array.isArray(agentResponseState.messages)) {
                const lastMessage = agentResponseState.messages[agentResponseState.messages.length -1];
                if (lastMessage) {
                    if (lastMessage.content && typeof lastMessage.content === 'string') {
                        responseContent = lastMessage.content;
                    } else if ((lastMessage as AIMessage).tool_calls && (lastMessage as AIMessage).tool_calls!.length > 0) {
                        const toolCallSummary = (lastMessage as AIMessage).tool_calls!.map(tc => 
                            `Called tool '${tc.name}' with args ${JSON.stringify(tc.args)}`
                        ).join('; ');
                        responseContent = toolCallSummary;
                    } else if (lastMessage.content) {
                        responseContent = JSON.stringify(lastMessage.content);
                    }
                }
            }
            
            // Send response back to the original requester (InputPill)
            event.sender.send('agent-response', responseContent);
            
            logger.debug(`[main-handlers] Checking athenaWidgetInstance before emitting AGENT_RESPONSE. Is defined: ${!!athenaWidgetInstance}`);
            if (athenaWidgetInstance) {
                 logger.debug(`[main-handlers] Emitting ${ATHENA_WIDGET_IPC_EVENTS.AGENT_RESPONSE} with content:`, responseContent);
                 ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.AGENT_RESPONSE, responseContent);
            } else {
                logger.warn('[main-handlers] athenaWidgetInstance is falsy. Skipping AGENT_RESPONSE emit.');
            }

        } catch (e: any) {
            logger.error('[ipcMain] Error running CanvasEngine agent:', e.message, e.stack);
            const errorMessage = `Error: ${e.message}`;
            // Send error back to the original requester (InputPill)
            event.sender.send('agent-response', errorMessage);

            logger.debug(`[main-handlers] Checking athenaWidgetInstance before emitting AGENT_ERROR (general error). Is defined: ${!!athenaWidgetInstance}`);
            if (athenaWidgetInstance) {
                logger.debug(`[main-handlers] Emitting ${ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR} with message: "${errorMessage}"`);
                ipcMain.emit(ATHENA_WIDGET_IPC_EVENTS.AGENT_ERROR, errorMessage);
            } else {
                logger.warn('[main-handlers] athenaWidgetInstance is falsy. Skipping AGENT_ERROR (general error) emit.');
            }
        }
    });

    // Add other IPC handlers here if needed in the future
    logger.info('[ipcMain] Main process event handlers registered.');
}
