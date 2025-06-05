const { ipcRenderer } = require('electron');

const queryInput = document.getElementById('query-input');

queryInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && queryInput.value.trim() !== '') {
        const query = queryInput.value.trim();
        console.log(`InputPill: Sending query to main: ${query}`);
        ipcRenderer.send('run-agent', query);
        queryInput.value = ''; // Clear the input after sending
    }
});

// Listen for responses (optional, if you want InputPill to show something)
ipcRenderer.on('agent-response', (event, response) => {
    console.log('InputPill: Received agent response in pill (can be ignored or used for status):', response);
    // You could update a status indicator here if needed
});
