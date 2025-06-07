import type { IpcRendererEvent } from 'electron'; // Only import the type

const conversationLog: HTMLElement | null = document.getElementById('conversation-log');

const cleanupConversationUpdateListener = window.electronAPI.ipcRendererOn('conversation-update', (event: IpcRendererEvent, { type, content }: { type: string, content: string }) => {
    console.log(`AthenaWidget: Received update - Type: ${type}, Content: ${content}`);
    const lineElement = document.createElement('div');
    lineElement.classList.add('log-line', type); // type will be 'user' or 'agent'

    const prefixElement = document.createElement('span');
    prefixElement.classList.add('prefix');
    prefixElement.textContent = type === 'user' ? 'You> ' : 'Athena> ';

    const contentElement = document.createElement('span');
    contentElement.classList.add('content');
    
    // Handle empty responses gracefully
    if (content === '__EMPTY_RESPONSE__') {
        contentElement.innerHTML = '<span class="completion-marker">✓ Task completed</span>';
        lineElement.classList.add('completion');
    } else {
        contentElement.textContent = content;
    }

    lineElement.appendChild(prefixElement);
    lineElement.appendChild(contentElement);
    
    if (conversationLog) {
        conversationLog.appendChild(lineElement);
    }

        // Scroll to the bottom to see the latest message
    if (conversationLog) {
        conversationLog.scrollTop = conversationLog.scrollHeight;
    }

});
