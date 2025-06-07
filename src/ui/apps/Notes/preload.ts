import type { Note } from '@ui/apps/Notes/notes.ipc';
import { contextBridge, ipcRenderer } from 'electron';

export interface NotesAPI {
    loadAllNotes: () => Promise<{ success: boolean; notes?: Note[]; error?: string }>;
    saveNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<{ success: boolean; note?: Note; error?: string }>;
    deleteNote: (noteId: string) => Promise<{ success: boolean; error?: string }>;
    focusWindow: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('notesAPI', {
    loadAllNotes: () => ipcRenderer.invoke('notes:load-all'),
    saveNote: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => 
        ipcRenderer.invoke('notes:save', note),
    deleteNote: (noteId: string) => ipcRenderer.invoke('notes:delete', noteId),
    focusWindow: () => ipcRenderer.send('notes:focus'),
} as NotesAPI);

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        notesAPI: NotesAPI;
    }
} 