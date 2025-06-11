import { createLogger } from '@/lib/utils/logger';
import type { IpcRendererEvent } from 'electron'; // Only import the type
import type { ConversationUpdate } from '@core/agent/types/tool-status'; // Import the shared type

const logger = createLogger('[AthenaWidget]');
const conversationLog: HTMLElement | null = document.getElementById('conversation-log');

// Keep track of current streaming message
let currentStreamingElement: HTMLElement | null = null;
let streamingContentElement: HTMLElement | null = null;

/**
 * Ensures the UI transitions from a 'thinking' state to a 'streaming' state.
 * This function makes the UI resilient to missed 'agent-stream-start' events.
 */
function ensureStreamingState() {
    if (currentStreamingElement && currentStreamingElement.classList.contains('thinking')) {
        const thinkingIndicator = currentStreamingElement.querySelector('.thinking-indicator');
        if (thinkingIndicator) thinkingIndicator.remove();
        currentStreamingElement.classList.remove('thinking');
        currentStreamingElement.classList.add('streaming');
        streamingContentElement = currentStreamingElement.querySelector('.content');
    }
}

const cleanupConversationUpdateListener = window.electronAPI.ipcRendererOn('conversation-update', (event: IpcRendererEvent, update: ConversationUpdate) => {
    const { type, content, status, toolName } = update;
    
    // Use debug for renderer debugging
    if (process.env.NODE_ENV === 'development') {
        console.debug(`Received update - Type: ${type}, Content: "${content || ''}", Status: ${status || 'none'}`);
    }

    if (!conversationLog) {
        console.error('conversation-log element not found');
        return;
    }

    if (type === 'user') {
        // User message
        const logLine = document.createElement('div');
        logLine.className = 'log-line user';
        logLine.innerHTML = `<span class="prefix">You></span> <span class="content">${content || ''}</span>`;
        conversationLog.appendChild(logLine);
        conversationLog.scrollTop = conversationLog.scrollHeight;
        
    } else if (type === 'agent-thinking') {
        // Agent is thinking - create a new line with a thinking indicator
        const logLine = document.createElement('div');
        logLine.className = 'log-line agent thinking';
        logLine.innerHTML = `<span class="prefix">Athena></span> <span class="content"></span><span class="thinking-indicator">Thinking...</span>`;
        conversationLog.appendChild(logLine);
        conversationLog.scrollTop = conversationLog.scrollHeight;
        
        // Store references for transition to streaming
        currentStreamingElement = logLine;
        streamingContentElement = logLine.querySelector('.content');

    } else if (type === 'agent-stream-start') {
        // Start of agent streaming - transition from thinking
        ensureStreamingState();
        
    } else if (type === 'agent-stream') {
        // If we're getting a stream, we're not "thinking" anymore.
        ensureStreamingState();

        // Streaming content chunk
        if (streamingContentElement) {
            // Use appendChild with a text node to avoid destroying existing elements (like tool pills)
            const textNode = document.createTextNode(content || ''); // Ensure content is a string
            streamingContentElement.appendChild(textNode);
            conversationLog.scrollTop = conversationLog.scrollHeight;
        }
        
    } else if (type === 'tool-call') {
        // If we're getting a tool call, we're not "thinking" anymore.
        ensureStreamingState();

        // Tool call pill is only sent when enabled, so we just render it.
        if (currentStreamingElement && streamingContentElement) {
            // Use toolName directly from the destructured update object
            const pillName = toolName || 'tool'; // Fallback if toolName is undefined
            const toolPill = document.createElement('span');
            toolPill.className = 'tool-pill';
            toolPill.setAttribute('data-tool-name', pillName);
            toolPill.textContent = pillName;
            
            // Append the pill and a space
            streamingContentElement.appendChild(toolPill);
            streamingContentElement.appendChild(document.createTextNode(' '));
        }
        
    } else if (type === 'tool-status') {
        // Tool status update - find the tool pill and update its status
        const toolName = content;
            
        if (status) {
            // Find all tool pills with matching tool name
            const toolPills = document.querySelectorAll(`.tool-pill[data-tool-name="${toolName}"]`);
            toolPills.forEach((pill) => {
                // Remove existing status classes
                pill.classList.remove('executing', 'completed', 'error');
                // Add new status class
                pill.classList.add(status as string); // Cast status as it's ToolStatus type, but classList needs string
            });
            
            if (process.env.NODE_ENV === 'development') {
                console.debug(`Updated tool pill ${toolName} to status: ${status}`);
            }
        }
        
    } else if (type === 'agent-stream-end') {
        // Finalize streaming message
        if (currentStreamingElement) {
            // Remove any indicator (thinking or typing)
            const thinkingIndicator = currentStreamingElement.querySelector('.thinking-indicator');
            if (thinkingIndicator) thinkingIndicator.remove();
            
            const typingIndicator = currentStreamingElement.querySelector('.typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }

            // Remove state classes
            currentStreamingElement.classList.remove('streaming', 'thinking');
        }

        // Clear streaming references
        currentStreamingElement = null;
        streamingContentElement = null;

    } else if (type === 'agent-stream-error') {
        // Handle streaming error
        if (currentStreamingElement && streamingContentElement) {
            streamingContentElement.textContent = content ?? null; // Handle undefined content
            
            // Remove thinking or typing indicator
            const thinkingIndicator = currentStreamingElement.querySelector('.thinking-indicator');
            const typingIndicator = currentStreamingElement.querySelector('.typing-indicator');
            if (thinkingIndicator) {
                thinkingIndicator.remove();
            }
            if (typingIndicator) {
                typingIndicator.remove();
            }
            
            // Remove streaming/thinking class and add error class
            currentStreamingElement.classList.remove('streaming', 'thinking');
            currentStreamingElement.classList.add('error');
        } else {
            // Create new error message if no streaming element exists
            const logLine = document.createElement('div');
            logLine.className = 'log-line agent error';
            logLine.innerHTML = `<span class="prefix">Athena></span> <span class="content">${content || ''}</span>`;
            conversationLog.appendChild(logLine);
        }
        
        conversationLog.scrollTop = conversationLog.scrollHeight;
        
        // Clear streaming references
        currentStreamingElement = null;
        streamingContentElement = null;
        
    } else if (type === 'agent') {
        // Regular agent message (fallback)
        const logLine = document.createElement('div');
        logLine.className = 'log-line agent';
        logLine.innerHTML = `<span class="prefix">Athena></span> <span class="content">${content || ''}</span>`;
        conversationLog.appendChild(logLine);
        conversationLog.scrollTop = conversationLog.scrollHeight;
    }
});

// Listen for updates from main process
const cleanupUpdateListener = window.electronAPI.ipcRendererOn('update-content', (event: any, { type, content }: { type: string, content: string }) => {
    if (process.env.NODE_ENV === 'development') {
        console.debug(`Received update - Type: ${type}, Content: ${content}`);
    }
    
    // Update the display
    const displayElement = document.getElementById('content-display');
    if (displayElement) {
        displayElement.textContent = `${type}: ${content || ''}`;
    }
});

// Signal to the main process that the widget is ready to receive messages
window.addEventListener('DOMContentLoaded', () => {
    (window as any).electronAPI.ipcRendererSend('athena-widget-ready');
    if (process.env.NODE_ENV === 'development') {
        console.debug('Sent athena-widget-ready signal.');
    }
});

// Cleanup IPC listeners on window unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
    if (typeof cleanupConversationUpdateListener === 'function') {
        cleanupConversationUpdateListener();
    }
    if (typeof cleanupUpdateListener === 'function') {
        cleanupUpdateListener();
    }
});
