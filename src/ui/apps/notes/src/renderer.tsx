import { createRoot } from 'react-dom/client';
import { NotesApp } from './components/NotesApp';

const container = document.getElementById('notes-root');
if (!container) {
    throw new Error('Failed to find the root element');
}

const root = createRoot(container);
root.render(<NotesApp />);