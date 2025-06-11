import type { IpcRendererEvent } from 'electron'; // Only import the type

const queryInput = document.getElementById('query-input') as HTMLInputElement | null;

if (queryInput) {
    queryInput.addEventListener('keypress', async (event) => {
        if (event.key === 'Enter') {
            const query = queryInput.value.trim();
            if (query) {
                console.debug(`Sending query to main: ${query}`);
                queryInput.value = ''; // Clear the input immediately
                const result = await window.electronAPI.ipcRendererInvoke('athena:chat', query);
                console.debug('Agent invocation result:', result);
            }
        }
    });
}

// Listen for agent responses
window.electronAPI.ipcRendererOn('agent-response', (event: IpcRendererEvent, response: any) => {
    console.debug('Received agent response in pill (can be ignored or used for status):', response);
    // You could update a status indicator here if needed
});
