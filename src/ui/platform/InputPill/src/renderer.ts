import type { IpcRendererEvent } from 'electron'; // Only import the type

const queryInput = document.getElementById('query-input') as HTMLInputElement | null;

if (queryInput) {
    queryInput.addEventListener('keypress', (event: KeyboardEvent) => {
    if (event.key === 'Enter' && queryInput.value.trim() !== '') {
        const query = queryInput.value.trim();
        // Use console.debug for renderer debugging
        if (process.env.NODE_ENV === 'development') {
            console.debug(`InputPill: Sending query to main: ${query}`);
        }
        window.electronAPI.ipcRendererSend('run-agent', query);
                queryInput.value = ''; // Clear the input after sending
    }
    });
}

// Listen for responses (optional, if you want InputPill to show something)
const cleanupAgentResponseListener = window.electronAPI.ipcRendererOn('agent-response', (event: IpcRendererEvent, response: any) => {
    if (process.env.NODE_ENV === 'development') {
        console.debug('InputPill: Received agent response in pill (can be ignored or used for status):', response);
    }
    // You could update a status indicator here if needed
});
