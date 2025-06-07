import type { Note } from '@ui/apps/Notes/notes.ipc';
import React, { useEffect, useState } from 'react';

interface NotesAppState {
    notes: Note[];
    selectedNote: Note | null;
    isLoading: boolean;
    error: string | null;
}

export const NotesApp: React.FC = () => {
    const [state, setState] = useState<NotesAppState>({
        notes: [],
        selectedNote: null,
        isLoading: true,
        error: null,
    });

    const [editorState, setEditorState] = useState({
        title: '',
        content: '',
        hasChanges: false,
    });

    // Load notes on component mount
    useEffect(() => {
        loadNotes();
    }, []);

    const loadNotes = async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        
        try {
            const result = await window.notesAPI.loadAllNotes();
            if (result.success && result.notes) {
                setState(prev => ({
                    ...prev,
                    notes: result.notes!,
                    isLoading: false,
                }));
            } else {
                setState(prev => ({
                    ...prev,
                    error: result.error || 'Failed to load notes',
                    isLoading: false,
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: 'Failed to load notes',
                isLoading: false,
            }));
        }
    };

    const createNewNote = () => {
        const newNote = {
            title: 'Untitled Note',
            content: '',
        };
        
        setEditorState({
            title: newNote.title,
            content: newNote.content,
            hasChanges: true,
        });
        
        setState(prev => ({ ...prev, selectedNote: null }));
    };

    const selectNote = (note: Note) => {
        setState(prev => ({ ...prev, selectedNote: note }));
        setEditorState({
            title: note.title,
            content: note.content,
            hasChanges: false,
        });
    };

    const updateEditor = (field: 'title' | 'content', value: string) => {
        setEditorState(prev => ({
            ...prev,
            [field]: value,
            hasChanges: true,
        }));
    };

    const saveNote = async () => {
        if (!editorState.title.trim() && !editorState.content.trim()) {
            return;
        }

        try {
            const noteData = {
                id: state.selectedNote?.id,
                title: editorState.title.trim() || 'Untitled Note',
                content: editorState.content,
            };

            const result = await window.notesAPI.saveNote(noteData);
            
            if (result.success && result.note) {
                const savedNote = result.note;
                
                setState(prev => {
                    const updatedNotes = prev.selectedNote
                        ? prev.notes.map(n => n.id === savedNote.id ? savedNote : n)
                        : [savedNote, ...prev.notes];
                    
                    return {
                        ...prev,
                        notes: updatedNotes,
                        selectedNote: savedNote,
                    };
                });
                
                setEditorState(prev => ({ ...prev, hasChanges: false }));
            } else {
                setState(prev => ({
                    ...prev,
                    error: result.error || 'Failed to save note',
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: 'Failed to save note',
            }));
        }
    };

    const deleteNote = async () => {
        if (!state.selectedNote) return;

        const confirmed = confirm('Are you sure you want to delete this note?');
        if (!confirmed) return;

        try {
            const result = await window.notesAPI.deleteNote(state.selectedNote.id);
            
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    notes: prev.notes.filter(n => n.id !== prev.selectedNote?.id),
                    selectedNote: null,
                }));
                
                setEditorState({
                    title: '',
                    content: '',
                    hasChanges: false,
                });
            } else {
                setState(prev => ({
                    ...prev,
                    error: result.error || 'Failed to delete note',
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: 'Failed to delete note',
            }));
        }
    };

    const formatDate = (date: Date) => {
        const now = new Date();
        const noteDate = new Date(date);
        const diffMs = now.getTime() - noteDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return noteDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return noteDate.toLocaleDateString();
        }
    };

    return (
        <div className="notes-app">
            {/* Header */}
            <div className="notes-header">
                <h1 className="notes-title">Notes</h1>
                <button className="new-note-btn" onClick={createNewNote}>
                    + New Note
                </button>
            </div>

            {/* Main Content */}
            <div className="notes-content">
                {/* Sidebar */}
                <div className="notes-sidebar">
                    {state.isLoading ? (
                        <div className="empty-state">Loading notes...</div>
                    ) : state.error ? (
                        <div className="empty-state">Error: {state.error}</div>
                    ) : state.notes.length === 0 ? (
                        <div className="empty-state">
                            No notes yet.<br />
                            Click "New Note" to get started.
                        </div>
                    ) : (
                        <ul className="notes-list">
                            {state.notes.map(note => (
                                <li
                                    key={note.id}
                                    className={`note-item ${state.selectedNote?.id === note.id ? 'active' : ''}`}
                                    onClick={() => selectNote(note)}
                                >
                                    <div className="note-title">{note.title}</div>
                                    <div className="note-preview">
                                        {note.content.slice(0, 100) || 'No content'}
                                    </div>
                                    <div className="note-date">
                                        {formatDate(note.updatedAt)}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Editor */}
                <div className="note-editor">
                    {state.selectedNote || editorState.hasChanges ? (
                        <>
                            <div className="editor-header">
                                <input
                                    type="text"
                                    className="editor-title-input"
                                    placeholder="Note title..."
                                    value={editorState.title}
                                    onChange={(e) => updateEditor('title', e.target.value)}
                                />
                                <div className="editor-actions">
                                    <button
                                        className="save-btn"
                                        onClick={saveNote}
                                        disabled={!editorState.hasChanges}
                                    >
                                        Save
                                    </button>
                                    {state.selectedNote && (
                                        <button
                                            className="delete-btn"
                                            onClick={deleteNote}
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="editor-content">
                                <textarea
                                    className="editor-textarea"
                                    placeholder="Start writing your note..."
                                    value={editorState.content}
                                    onChange={(e) => updateEditor('content', e.target.value)}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="empty-editor">
                            <div>
                                Select a note to edit or<br />
                                create a new note to get started
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}; 