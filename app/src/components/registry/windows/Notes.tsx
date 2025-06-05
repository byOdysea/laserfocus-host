import React, { useState, useEffect } from 'react';

// Interfaces
interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface NotesDataConfig {
  initialSelectedNoteId?: string;
  filter?: 'all' | 'pinned'; // Example, not implemented in MVP
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
}

export interface NotesProps {
  instanceId: string;
  viewMode: 'widget' | 'full';
  props?: {
    dataConfig?: NotesDataConfig;
  };
  // onInteraction?: (interaction: any) => void; // For future use
}

// Mock Data
const mockNotes: Note[] = [
  { id: '1', title: 'Grocery List', content: 'Milk, Eggs, Bread, Apples, Bananas, Cheese, Yogurt, Chicken, Rice, Pasta, Sauce, Onions, Garlic. Remember to check for organic options.', createdAt: new Date(Date.now() - 86400000 * 2), updatedAt: new Date(Date.now() - 86400000 * 1) },
  { id: '2', title: 'Meeting Notes - Q3 Planning', content: 'Discuss Q3 roadmap. Key takeaways: Focus on user engagement. New feature launch planned for August. Marketing campaign to align. Allocate resources for R&D. Follow up with team leads by EOW.', createdAt: new Date(Date.now() - 86400000 * 5), updatedAt: new Date(Date.now() - 86400000 * 3) },
  { id: '3', title: 'Idea for Project Phoenix', content: 'A new approach to data visualization using interactive 3D models. Potential to revolutionize how users interact with complex datasets. Need to research WebGL libraries and performance implications. Draft a proposal.', createdAt: new Date(Date.now() - 86400000 * 10), updatedAt: new Date(Date.now() - 86400000 * 10) },
  { id: '4', title: 'Book Recommendations', content: '1. Sapiens by Yuval Noah Harari\n2. Atomic Habits by James Clear\n3. The Pragmatic Programmer by Andrew Hunt and David Thomas\n4. Thinking, Fast and Slow by Daniel Kahneman', createdAt: new Date(Date.now() - 86400000 * 1), updatedAt: new Date() },
];

const Notes: React.FC<NotesProps> = ({ instanceId, viewMode, props }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  useEffect(() => {
    console.log(`Notes component (${instanceId}) initializing with config:`, props?.dataConfig);
    let processedNotes = [...mockNotes];

    if (props?.dataConfig?.sortBy === 'title') {
      processedNotes.sort((a, b) => a.title.localeCompare(b.title));
    } else if (props?.dataConfig?.sortBy === 'createdAt') {
      processedNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else { // Default to updatedAt descending (most recently updated first)
      processedNotes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    setNotes(processedNotes);

    if (props?.dataConfig?.initialSelectedNoteId) {
      const note = processedNotes.find(n => n.id === props.dataConfig?.initialSelectedNoteId);
      setSelectedNote(note || (processedNotes.length > 0 ? processedNotes[0] : null));
    } else if (processedNotes.length > 0) {
      setSelectedNote(processedNotes[0]);
    } else {
      setSelectedNote(null);
    }
  }, [props?.dataConfig, instanceId]); // Removed viewMode from deps as selection logic handles it

  const handleNoteSelect = (note: Note) => {
    setSelectedNote(note);
  };

  // Common Styles
  const commonBoxSizing: React.CSSProperties = { boxSizing: 'border-box' };

  const baseStyle: React.CSSProperties = {
    ...commonBoxSizing,
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    height: '100%',
    width: '100%',
    backgroundColor: '#f4f7f9', // Softer background
    color: '#333',
  };

  // Widget View
  if (viewMode === 'widget') {
    const recentNote = notes[0];
    const widgetStyle: React.CSSProperties = {
      ...baseStyle,
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      backgroundColor: '#ffffff',
      padding: '16px',
      justifyContent: 'space-between', // Pushes total notes to bottom
      alignItems: 'flex-start',
    };
    const widgetTitleStyle: React.CSSProperties = { margin: '0 0 12px 0', fontSize: '1.1em', color: '#2c3e50', fontWeight: 600 };
    const notePreviewStyle: React.CSSProperties = { width: '100%' };
    const notePreviewTitleStyle: React.CSSProperties = { margin: '0 0 6px 0', fontSize: '0.95em', fontWeight: 600, color: '#34495e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
    const notePreviewContentStyle: React.CSSProperties = { fontSize: '0.8em', margin: 0, color: '#555', maxHeight: '3.6em', lineHeight: '1.2em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' };
    const widgetFooterStyle: React.CSSProperties = { fontSize: '0.75em', color: '#7f8c8d', marginTop: '12px', textAlign: 'right', width: '100%' };

    return (
      <div style={widgetStyle}>
        <div>
          <h3 style={widgetTitleStyle}>Quick Note</h3>
          {recentNote ? (
            <div style={notePreviewStyle}>
              <h4 style={notePreviewTitleStyle}>{recentNote.title}</h4>
              <p style={notePreviewContentStyle}>{recentNote.content}</p>
            </div>
          ) : (
            <p style={{ fontSize: '0.9em', color: '#7f8c8d' }}>No active notes.</p>
          )}
        </div>
        <p style={widgetFooterStyle}>{notes.length} notes</p>
      </div>
    );
  }

  // Full View (Portrait Optimized)
  const fullViewStyle: React.CSSProperties = {
    ...baseStyle,
    flexDirection: 'row',
  };

  const noteListPaneStyle: React.CSSProperties = {
    ...commonBoxSizing,
    width: '300px', // Fixed width for portrait, can be % for landscape
    minWidth: '220px',
    maxWidth: '35%',
    borderRight: '1px solid #dce4e9',
    overflowY: 'auto',
    padding: '12px',
    backgroundColor: '#e9edf0' // Slightly different bg for list pane
  };
  
  const noteListTitleStyle: React.CSSProperties = { marginTop: '0', marginBottom: '12px', fontSize: '1.2em', color: '#2c3e50', fontWeight: 600, paddingLeft: '4px' };

  const noteListItemStyleBase: React.CSSProperties = {
    ...commonBoxSizing,
    padding: '10px 12px',
    marginBottom: '8px',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    border: '1px solid #dce4e9',
    transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  };

  const noteListItemTitleStyle: React.CSSProperties = { fontWeight: 600, marginBottom: '4px', fontSize: '0.95em', color: '#34495e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const noteListItemSnippetStyle: React.CSSProperties = { fontSize: '0.8em', color: '#555', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const noteListItemDateStyle: React.CSSProperties = { fontSize: '0.75em', color: '#7f8c8d' };

  const noteDetailPaneStyle: React.CSSProperties = {
    ...commonBoxSizing,
    flexGrow: 1,
    padding: '24px',
    overflowY: 'auto',
  };

  const noteDetailTitleStyle: React.CSSProperties = { fontSize: '1.8em', marginBottom: '8px', color: '#1c2833', fontWeight: 600, lineHeight: 1.3 };
  const noteDetailMetaStyle: React.CSSProperties = { fontSize: '0.8em', color: '#7f8c8d', marginBottom: '20px' };
  const noteDetailContentStyle: React.CSSProperties = { fontSize: '1em', color: '#333', lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

  return (
    <div style={fullViewStyle}>
      <style>{`.note-list-item:hover { background-color: #f0f4f7; box-shadow: 0 2px 4px rgba(0,0,0,0.06); }`}</style> {/* Simple hover effect */}
      <div style={noteListPaneStyle}>
        <h3 style={noteListTitleStyle}>All Notes</h3>
        {notes.length > 0 ? (
          notes.map(note => {
            const isSelected = selectedNote?.id === note.id;
            const itemStyle: React.CSSProperties = {
              ...noteListItemStyleBase,
              backgroundColor: isSelected ? '#d6eaf8' : '#ffffff', // Light blue for selected
              borderColor: isSelected ? '#aed6f1' : '#dce4e9',
              boxShadow: isSelected ? '0 2px 5px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.04)',
            };
            return (
              <div
                key={note.id}
                className="note-list-item" // For hover
                style={itemStyle}
                onClick={() => handleNoteSelect(note)}
                title={note.title}
              >
                <div style={noteListItemTitleStyle}>{note.title}</div>
                <div style={noteListItemSnippetStyle}>
                  {note.content.substring(0, 40)}{note.content.length > 40 ? '...' : ''}
                </div>
                <div style={noteListItemDateStyle}>
                  {new Date(note.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              </div>
            );
          })
        ) : (
          <p style={{textAlign: 'center', color: '#7f8c8d', marginTop: '20px'}}>No notes found.</p>
        )}
      </div>
      <div style={noteDetailPaneStyle}>
        {selectedNote ? (
          <>
            <h2 style={noteDetailTitleStyle}>{selectedNote.title}</h2>
            <p style={noteDetailMetaStyle}>
              Last updated: {new Date(selectedNote.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <div style={noteDetailContentStyle}>{selectedNote.content}</div>
          </>
        ) : (
          <div style={{display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d'}}>
            <p>Select a note to view its content.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notes;