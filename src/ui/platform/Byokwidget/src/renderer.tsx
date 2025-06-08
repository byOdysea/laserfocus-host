import React from 'react';
import { createRoot } from 'react-dom/client';
import { ByokwidgetApp } from './components/ByokwidgetApp';

const container = document.getElementById('byokwidget-root');
if (!container) {
    throw new Error('Failed to find the root element');
}

const root = createRoot(container);
root.render(<ByokwidgetApp />);