import React from 'react';
import { createRoot } from 'react-dom/client';
import { RemindersApp } from './components/RemindersApp';

const container = document.getElementById('reminders-root');
if (!container) {
    throw new Error('Failed to find the root element');
}

const root = createRoot(container);
root.render(<RemindersApp />);