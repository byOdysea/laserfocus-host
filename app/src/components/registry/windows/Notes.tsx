import { Edit3, FileText, Folder, Plus, Search, Star, Trash2 } from 'lucide-react';
import React from 'react';

interface Note {
  id: string;
  title: string;
  content: string;
  folder?: string;
  tags: string[];
  isStarred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NotesProps {
  isWidget?: boolean;
  notes?: Note[];
  selectedNote?: string | null;
  searchQuery?: string;
  selectedFolder?: string | null;
  isEditing?: boolean;
  editingContent?: {
    title: string;
    content: string;
  };
  view?: 'list' | 'grid';
  sortBy?: 'updated' | 'created' | 'title';
  onNoteSelect?: (id: string) => void;
  onNoteCreate?: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onNoteUpdate?: (id: string, note: Partial<Note>) => void;
  onNoteDelete?: (id: string) => void;
  onStarToggle?: (id: string) => void;
  onSearch?: (query: string) => void;
  onFolderSelect?: (folder: string | null) => void;
}

const defaultNotes: Note[] = [
  {
    id: '1',
    title: 'Meeting Notes - Product Roadmap',
    content: '## Q1 Goals\n- Launch new feature\n- Improve performance by 20%\n- User research for Q2\n\n## Action Items\n- Schedule design review\n- Update documentation',
    folder: 'Work',
    tags: ['meetings', 'product'],
    isStarred: true,
    createdAt: new Date('2024-01-14T10:00:00'),
    updatedAt: new Date('2024-01-15T14:30:00')
  },
  {
    id: '2',
    title: 'Recipe: Chocolate Chip Cookies',
    content: '### Ingredients\n- 2 cups flour\n- 1 cup butter\n- 1 cup sugar\n- 2 eggs\n- Chocolate chips\n\n### Instructions\n1. Mix dry ingredients\n2. Cream butter and sugar\n3. Add eggs\n4. Combine all ingredients\n5. Bake at 350°F for 12 minutes',
    folder: 'Personal',
    tags: ['recipes', 'cooking'],
    isStarred: false,
    createdAt: new Date('2024-01-10T18:00:00'),
    updatedAt: new Date('2024-01-10T18:30:00')
  },
  {
    id: '3',
    title: 'Book Notes: Deep Work',
    content: 'Key takeaways from Deep Work by Cal Newport:\n\n1. **Focus is a superpower** in the modern economy\n2. **Shallow work** is increasingly common but less valuable\n3. **Deep work habits** must be cultivated\n4. **Attention residue** reduces performance',
    folder: 'Reading',
    tags: ['books', 'productivity'],
    isStarred: true,
    createdAt: new Date('2024-01-12T20:00:00'),
    updatedAt: new Date('2024-01-13T10:00:00')
  }
];

const Notes: React.FC<NotesProps> = ({
  isWidget = false,
  notes = defaultNotes,
  selectedNote = null,
  searchQuery = '',
  selectedFolder = null,
  isEditing = false,
  editingContent = { title: '', content: '' },
  view = 'list',
  sortBy = 'updated',
  onNoteSelect = () => {},
  onNoteCreate = () => {},
  onNoteUpdate = () => {},
  onNoteDelete = () => {},
  onStarToggle = () => {},
  onSearch = () => {},
  onFolderSelect = () => {}
}) => {
  const recentNotes = [...notes].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 3);

  if (isWidget) {
    // Widget view - display only, no interactions
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-600" />
              <span className="font-medium text-gray-900">Notes</span>
            </div>
            <span className="text-xs text-gray-500">{notes.length}</span>
          </div>
        </div>
        
        {/* Notes list - takes available space */}
        <div className="flex-1 px-4 py-2 overflow-hidden">
          {recentNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <div className="text-sm">No notes yet</div>
            </div>
          ) : (
            <div className="space-y-3">
              {recentNotes.map(note => (
                <div key={note.id} className="-mx-2 px-2 py-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-medium text-gray-900 truncate flex-1">
                          {note.title}
                        </div>
                        {note.isStarred && (
                          <Star className="w-3 h-3 text-yellow-500 fill-current ml-2 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      {note.folder && (
                        <div className="text-xs text-gray-400 mt-1">{note.folder}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer - just display info */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 text-center">
            {recentNotes.length} recent notes
          </div>
        </div>
      </div>
    );
  }

  // Full window view
  const folders = Array.from(new Set(notes.map(note => note.folder).filter(Boolean))) as string[];
  
  const filteredNotes = notes.filter(note => {
    if (searchQuery && !note.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !note.content.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedFolder && note.folder !== selectedFolder) {
      return false;
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    switch (sortBy) {
      case 'updated':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'created':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  const selectedNoteData = notes.find(note => note.id === selectedNote);

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <button
          onClick={() => onNoteCreate({
            title: 'Untitled Note',
            content: '',
            tags: [],
            isStarred: false
          })}
          className="w-full bg-orange-600 text-white rounded-lg py-2 px-4 mb-4 flex items-center justify-center gap-2 hover:bg-orange-700"
        >
          <Plus className="w-4 h-4" />
          New Note
        </button>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search notes..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </div>

        <nav className="space-y-1 mb-6">
          <button
            onClick={() => onFolderSelect(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
              !selectedFolder ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-100'
            }`}
          >
            All Notes
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100">
            Starred
          </button>
        </nav>

        <div>
          <div className="text-xs font-medium text-gray-500 uppercase mb-2">Folders</div>
          <div className="space-y-1">
            {folders.map(folder => (
              <button
                key={folder}
                onClick={() => onFolderSelect(folder)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  selectedFolder === folder ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-100'
                }`}
              >
                <Folder className="w-4 h-4" />
                {folder}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes List */}
      <div className="w-80 bg-white border-r border-gray-200">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-medium">{sortedNotes.length} notes</span>
          <select
            className="text-sm border border-gray-300 rounded px-2 py-1"
            value={sortBy}
            onChange={(e) => {}}
          >
            <option value="updated">Last Updated</option>
            <option value="created">Date Created</option>
            <option value="title">Title</option>
          </select>
        </div>
        
        <div className="overflow-y-auto">
          {sortedNotes.map(note => (
            <div
              key={note.id}
              onClick={() => onNoteSelect(note.id)}
              className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                selectedNote === note.id ? 'bg-orange-50 border-l-4 border-orange-600' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-medium text-sm truncate flex-1">{note.title}</h3>
                {note.isStarred && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
              </div>
              <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                {note.content.replace(/[#*\n]/g, ' ').trim()}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                {note.folder && (
                  <>
                    <span>•</span>
                    <span>{note.folder}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note Editor/Viewer */}
      <div className="flex-1 bg-white">
        {selectedNoteData ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => onStarToggle(selectedNoteData.id)}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <Star className={`w-5 h-5 ${selectedNoteData.isStarred ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} />
                </button>
                <button className="p-2 hover:bg-gray-100 rounded">
                  <Edit3 className="w-5 h-5 text-gray-400" />
                </button>
                <button
                  onClick={() => onNoteDelete(selectedNoteData.id)}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <Trash2 className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="text-sm text-gray-500">
                Last updated: {new Date(selectedNoteData.updatedAt).toLocaleString()}
              </div>
            </div>
            
            {isEditing ? (
              <div className="flex-1 p-6 flex flex-col">
                <input
                  type="text"
                  className="text-2xl font-bold mb-4 border-b border-gray-200 pb-2 focus:outline-none"
                  value={editingContent.title}
                  placeholder="Note title..."
                />
                <textarea
                  className="flex-1 resize-none focus:outline-none"
                  value={editingContent.content}
                  placeholder="Start typing..."
                />
              </div>
            ) : (
              <div className="flex-1 p-6 overflow-y-auto">
                <h1 className="text-2xl font-bold mb-4">{selectedNoteData.title}</h1>
                <div className="prose max-w-none">
                  <pre className="whitespace-pre-wrap font-sans">{selectedNoteData.content}</pre>
                </div>
                <div className="mt-8 pt-4 border-t border-gray-200">
                  <div className="flex gap-2">
                    {selectedNoteData.tags.map(tag => (
                      <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a note to view or edit
          </div>
        )}
      </div>
    </div>
  );
};

export default Notes;
