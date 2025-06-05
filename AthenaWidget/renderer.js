const { ipcRenderer } = require('electron');

const conversationLog = document.getElementById('conversation-log');

ipcRenderer.on('conversation-update', (event, { type, content }) => {
    console.log(`AthenaWidget: Received update - Type: ${type}, Content: ${content}`);
    const lineElement = document.createElement('div');
    lineElement.classList.add('log-line', type); // type will be 'user' or 'agent'

    const prefixElement = document.createElement('span');
    prefixElement.classList.add('prefix');
    prefixElement.textContent = type === 'user' ? 'You> ' : 'Athena> ';

    const contentElement = document.createElement('span');
    contentElement.classList.add('content');
    contentElement.textContent = content;

    lineElement.appendChild(prefixElement);
    lineElement.appendChild(contentElement);
    
    conversationLog.appendChild(lineElement);

    // Scroll to the bottom to see the latest message
    conversationLog.scrollTop = conversationLog.scrollHeight;
});
