import { AppIpcModule, AppMainProcessInstances } from '@core/bridge/types';
import { NotesWindow } from '@ui/apps/Notes/notes.main';
import * as logger from '@utils/logger';
import { IpcMain } from 'electron';

export interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

// Simple in-memory note storage for this demo
// In a real app, you'd use SQLite or another persistent storage
class NotesStorage {
    private notes: Map<string, Note> = new Map();

    getAllNotes(): Note[] {
        return Array.from(this.notes.values()).sort((a, b) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }

    getNote(id: string): Note | undefined {
        return this.notes.get(id);
    }

    saveNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Note {
        const now = new Date();
        if (note.id && this.notes.has(note.id)) {
            // Update existing note
            const existingNote = this.notes.get(note.id)!;
            const updatedNote: Note = {
                ...existingNote,
                title: note.title,
                content: note.content,
                updatedAt: now,
            };
            this.notes.set(note.id, updatedNote);
            return updatedNote;
        } else {
            // Create new note
            const newNote: Note = {
                id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: note.title,
                content: note.content,
                createdAt: now,
                updatedAt: now,
            };
            this.notes.set(newNote.id, newNote);
            return newNote;
        }
    }

    deleteNote(id: string): boolean {
        return this.notes.delete(id);
    }
}

const notesStorage = new NotesStorage();

const NotesIpcHandlers: AppIpcModule = {
    moduleId: 'Notes',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        canvasEngine: CanvasEngine,
        appInstance: NotesWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[NotesIPC] Registering Notes IPC handlers');

        // Load all notes
        ipcMain.handle('notes:load-all', async () => {
            try {
                const notes = notesStorage.getAllNotes();
                logger.info(`[NotesIPC] Loaded ${notes.length} notes`);
                return { success: true, notes };
            } catch (error) {
                logger.error('[NotesIPC] Error loading notes:', error);
                return { success: false, error: 'Failed to load notes' };
            }
        });

        // Save note (create or update)
        ipcMain.handle('notes:save', async (event, noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
            try {
                const savedNote = notesStorage.saveNote(noteData);
                logger.info(`[NotesIPC] Saved note: ${savedNote.title} (ID: ${savedNote.id})`);
                return { success: true, note: savedNote };
            } catch (error) {
                logger.error('[NotesIPC] Error saving note:', error);
                return { success: false, error: 'Failed to save note' };
            }
        });

        // Delete note
        ipcMain.handle('notes:delete', async (event, noteId: string) => {
            try {
                const deleted = notesStorage.deleteNote(noteId);
                if (deleted) {
                    logger.info(`[NotesIPC] Deleted note with ID: ${noteId}`);
                    return { success: true };
                } else {
                    return { success: false, error: 'Note not found' };
                }
            } catch (error) {
                logger.error('[NotesIPC] Error deleting note:', error);
                return { success: false, error: 'Failed to delete note' };
            }
        });

        // Focus the notes window
        ipcMain.on('notes:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[NotesIPC] Notes IPC handlers registered successfully');
    }
};

export default NotesIpcHandlers; 