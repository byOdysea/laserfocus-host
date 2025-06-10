import type { IpcRendererEvent } from 'electron'; // Only import the type

const conversationLog: HTMLElement | null = document.getElementById('conversation-log');

// Keep track of current streaming message
let currentStreamingElement: HTMLElement | null = null;
let streamingContentElement: HTMLElement | null = null;

// Configuration cache
let enableToolPills = true; // Default value

// Load configuration on startup
async function loadConfiguration() {
    try {
        const result = await (window as any).electronAPI.getConfig();
        if (result.success && result.config) {
            enableToolPills = result.config.enableToolPills;
            if (process.env.NODE_ENV === 'development') {
                console.debug('AthenaWidget: Loaded configuration', { enableToolPills });
            }
        }
    } catch (error) {
        console.warn('AthenaWidget: Failed to load configuration, using defaults', error);
    }
}

// Load configuration immediately
loadConfiguration();

// Listen for configuration changes
const cleanupConfigListener = window.electronAPI.ipcRendererOn('config-changed', (event: IpcRendererEvent, newConfig: { enableToolPills: boolean }) => {
    enableToolPills = newConfig.enableToolPills;
    if (process.env.NODE_ENV === 'development') {
        console.debug('AthenaWidget: Configuration updated', { enableToolPills });
    }
});

const cleanupConversationUpdateListener = window.electronAPI.ipcRendererOn('conversation-update', (event: IpcRendererEvent, update: { type: string, content: string, status?: string, timestamp?: string }) => {
    const { type, content, status } = update;
    
    // Use console.debug for renderer debugging
    if (process.env.NODE_ENV === 'development') {
        console.debug(`AthenaWidget: Received update - Type: ${type}, Content: "${content}", Status: ${status || 'none'}`);
    }

    if (!conversationLog) {
        console.error('AthenaWidget: conversation-log element not found');
        return;
    }

    if (type === 'user') {
        // User message
        const logLine = document.createElement('div');
        logLine.className = 'log-line user';
        logLine.innerHTML = `<span class="prefix">You></span> <span class="content">${content}</span>`;
        conversationLog.appendChild(logLine);
        conversationLog.scrollTop = conversationLog.scrollHeight;
        
    } else if (type === 'agent-stream-start') {
        // Start of agent streaming
        const logLine = document.createElement('div');
        logLine.className = 'log-line agent streaming';
        logLine.innerHTML = `<span class="prefix">Athena></span> <span class="content"></span><span class="typing-indicator">⚡</span>`;
        conversationLog.appendChild(logLine);
        conversationLog.scrollTop = conversationLog.scrollHeight;
        
        // Store references for streaming updates
        currentStreamingElement = logLine;
        streamingContentElement = logLine.querySelector('.content');
        
    } else if (type === 'agent-stream') {
        // Streaming content chunk
        if (streamingContentElement) {
            // Check if this is the first character after a tool pill
            const currentContent = streamingContentElement.textContent || '';
            if (currentContent === '' && content.startsWith(' ')) {
                // Remove leading space if this is the first content after a tool pill
                streamingContentElement.textContent += content.trimStart();
            } else {
                streamingContentElement.textContent += content;
            }
            conversationLog.scrollTop = conversationLog.scrollHeight;
        }
        
    } else if (type === 'tool-call') {
        // Tool call pill - only create if enabled
        if (enableToolPills && currentStreamingElement) {
            // Check if this is the first tool call (no content yet)
            const contentElement = currentStreamingElement.querySelector('.content');
            const isFirstThing = !contentElement || contentElement.textContent?.trim() === '';
            
            const toolPill = document.createElement('span');
            toolPill.className = 'tool-pill';
            toolPill.setAttribute('data-tool-name', content);
            toolPill.textContent = `🔧 ${content}`;
            
            const prefix = currentStreamingElement.querySelector('.prefix');
            if (prefix) {
                if (isFirstThing) {
                    // When tool is first thing: Athena> 🔧 tool_name\n
                    // Insert elements in reverse order since we're using insertBefore
                    const lineBreak = document.createElement('br');
                    const space = document.createTextNode(' ');
                    
                    // Insert: space, pill, linebreak (in that order after prefix)
                    currentStreamingElement.insertBefore(lineBreak, prefix.nextSibling);
                    currentStreamingElement.insertBefore(toolPill, prefix.nextSibling);
                    currentStreamingElement.insertBefore(space, prefix.nextSibling);
                } else {
                    // Tool appears mid-sentence, keep inline with spaces
                    currentStreamingElement.insertBefore(document.createTextNode(' '), prefix.nextSibling);
                    currentStreamingElement.insertBefore(toolPill, prefix.nextSibling);
                    currentStreamingElement.insertBefore(document.createTextNode(' '), prefix.nextSibling);
                }
            }
        }
        // If tool pills are disabled, the tool call is simply ignored (no visual indication)
        
    } else if (type === 'tool-status') {
        // Tool status update - find the tool pill and update its status
        // Only process if tool pills are enabled
        if (enableToolPills) {
            const toolName = content;
            
            if (status) {
                // Find all tool pills with matching tool name
                const toolPills = document.querySelectorAll(`.tool-pill[data-tool-name="${toolName}"]`);
                toolPills.forEach((pill) => {
                    // Remove existing status classes
                    pill.classList.remove('executing', 'completed', 'error');
                    // Add new status class
                    pill.classList.add(status);
                });
                
                if (process.env.NODE_ENV === 'development') {
                    console.debug(`AthenaWidget: Updated tool pill ${toolName} to status: ${status}`);
                }
            }
        }
        
    } else if (type === 'agent-stream-end') {
        // Finalize streaming message
        if (currentStreamingElement) {
            // Remove typing indicator
            const typingIndicator = currentStreamingElement.querySelector('.typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }

            // Remove streaming class
            currentStreamingElement.classList.remove('streaming');
        }

        // Clear streaming references
        currentStreamingElement = null;
        streamingContentElement = null;

    } else if (type === 'agent-stream-error') {
        // Handle streaming error
        if (currentStreamingElement && streamingContentElement) {
            streamingContentElement.textContent = content;
            
            // Remove typing indicator
            const typingIndicator = currentStreamingElement.querySelector('.typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
            
            // Remove streaming class and add error class
            currentStreamingElement.classList.remove('streaming');
            currentStreamingElement.classList.add('error');
        } else {
            // Create new error message if no streaming element exists
            const logLine = document.createElement('div');
            logLine.className = 'log-line agent error';
            logLine.innerHTML = `<span class="prefix">Athena></span> <span class="content">${content}</span>`;
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
        logLine.innerHTML = `<span class="prefix">Athena></span> <span class="content">${content}</span>`;
        conversationLog.appendChild(logLine);
        conversationLog.scrollTop = conversationLog.scrollHeight;
    }
});

// Listen for updates from main process
const cleanupUpdateListener = window.electronAPI.ipcRendererOn('update-content', (event: any, { type, content }: { type: string, content: string }) => {
    if (process.env.NODE_ENV === 'development') {
        console.debug(`AthenaWidget: Received update - Type: ${type}, Content: ${content}`);
    }
    
    // Update the display
    const displayElement = document.getElementById('content-display');
    if (displayElement) {
        displayElement.textContent = `${type}: ${content}`;
    }
});
