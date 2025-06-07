import { NotesApp } from '@ui/apps/Notes/src/components/NotesApp';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('notes-root');
if (!container) {
    throw new Error('Failed to find the root element');
}

const root = createRoot(container);
root.render(<NotesApp />); 