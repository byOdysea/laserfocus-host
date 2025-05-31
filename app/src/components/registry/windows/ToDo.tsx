import { CheckSquare, Plus, Square, Tag } from 'lucide-react';
import React from 'react';

interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  tags: string[];
  createdAt: Date;
}

interface ToDoProps {
  isWidget?: boolean;
  tasks?: Task[];
  filter?: 'all' | 'active' | 'completed' | 'today' | 'upcoming';
  sortBy?: 'priority' | 'dueDate' | 'createdAt' | 'title';
  selectedTags?: string[];
  searchQuery?: string;
  onTaskToggle?: (id: string) => void;
  onTaskCreate?: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  onTaskUpdate?: (id: string, task: Partial<Task>) => void;
  onTaskDelete?: (id: string) => void;
  onFilterChange?: (filter: string) => void;
  onTagSelect?: (tag: string) => void;
}

const defaultTasks: Task[] = [
  {
    id: '1',
    title: 'Review project proposal',
    description: 'Go through the Q1 project proposal and provide feedback',
    completed: false,
    priority: 'high',
    dueDate: new Date('2024-01-16'),
    tags: ['work', 'urgent'],
    createdAt: new Date('2024-01-14')
  },
  {
    id: '2',
    title: 'Buy groceries',
    completed: false,
    priority: 'medium',
    tags: ['personal'],
    createdAt: new Date('2024-01-15')
  },
  {
    id: '3',
    title: 'Call dentist',
    completed: true,
    priority: 'low',
    tags: ['personal', 'health'],
    createdAt: new Date('2024-01-13')
  },
  {
    id: '4',
    title: 'Finish documentation',
    description: 'Complete the API documentation for the new endpoints',
    completed: false,
    priority: 'high',
    dueDate: new Date('2024-01-18'),
    tags: ['work', 'development'],
    createdAt: new Date('2024-01-14')
  }
];

const priorityColors = {
  low: 'text-gray-500',
  medium: 'text-yellow-500',
  high: 'text-red-500'
};

const ToDo: React.FC<ToDoProps> = ({
  isWidget = false,
  tasks = defaultTasks,
  filter = 'all',
  sortBy = 'priority',
  selectedTags = [],
  searchQuery = '',
  onTaskToggle = () => {},
  onTaskCreate = () => {},
  onTaskUpdate = () => {},
  onTaskDelete = () => {},
  onFilterChange = () => {},
  onTagSelect = () => {}
}) => {
  const activeTasks = tasks.filter(task => !task.completed);
  const completedToday = tasks.filter(task => 
    task.completed && 
    new Date(task.createdAt).toDateString() === new Date().toDateString()
  ).length;

  if (isWidget) {
    // Widget view - display only, no interactions
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-green-600" />
              <span className="font-medium text-gray-900">To-Do</span>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              {activeTasks.length}
            </span>
          </div>
        </div>
        
        {/* Tasks list - takes available space */}
        <div className="flex-1 px-4 py-2 overflow-hidden">
          {activeTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <CheckSquare className="w-8 h-8 mb-2 opacity-50" />
              <div className="text-sm">All tasks completed!</div>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTasks.slice(0, 2).map(task => (
                <div key={task.id} className="-mx-2 px-2 py-1">
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">
                      <Square className="w-3 h-3 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate leading-tight">{task.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColors[task.priority]}`}>
                          {task.priority}
                        </span>
                        {task.dueDate && (
                          <span className="text-xs text-gray-500">
                            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {activeTasks.length > 2 && (
                <div className="text-xs text-gray-500 text-center pt-1">
                  +{activeTasks.length - 2} more tasks
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer - just display info */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 text-center">
            {completedToday} completed today
          </div>
        </div>
      </div>
    );
  }

  // Full window view
  const filteredTasks = tasks.filter(task => {
    // Apply search filter
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Apply tag filter
    if (selectedTags.length > 0 && !selectedTags.some(tag => task.tags.includes(tag))) {
      return false;
    }
    
    // Apply status filter
    switch (filter) {
      case 'active': return !task.completed;
      case 'completed': return task.completed;
      case 'today': 
        return task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();
      case 'upcoming':
        return task.dueDate && new Date(task.dueDate) > new Date();
      default: return true;
    }
  });

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    switch (sortBy) {
      case 'priority': {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      case 'dueDate':
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });

  const allTags = Array.from(new Set(tasks.flatMap(task => task.tags)));

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <button
          onClick={() => onTaskCreate({
            title: 'New Task',
            completed: false,
            priority: 'medium',
            tags: []
          })}
          className="w-full bg-green-600 text-white rounded-lg py-2 px-4 mb-6 flex items-center justify-center gap-2 hover:bg-green-700"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
        
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 mb-2">Filter</div>
          <div className="space-y-1">
            {['all', 'active', 'completed', 'today', 'upcoming'].map(f => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`w-full text-left px-3 py-2 rounded-lg capitalize ${
                  filter === f ? 'bg-green-50 text-green-600' : 'hover:bg-gray-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Tags</div>
          <div className="space-y-1">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => onTagSelect(tag)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  selectedTags.includes(tag) ? 'bg-green-50 text-green-600' : 'hover:bg-gray-100'
                }`}
              >
                <Tag className="w-3 h-3" />
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            <div>{tasks.length} total tasks</div>
            <div>{activeTasks.length} active</div>
            <div>{tasks.length - activeTasks.length} completed</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-gray-800">Tasks</h2>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search tasks..."
                className="px-4 py-2 border border-gray-300 rounded-lg"
                value={searchQuery}
              />
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg"
                value={sortBy}
                onChange={(e) => {}}
              >
                <option value="priority">Priority</option>
                <option value="dueDate">Due Date</option>
                <option value="createdAt">Created</option>
                <option value="title">Title</option>
              </select>
            </div>
          </div>

          {/* Task List */}
          <div className="space-y-2">
            {sortedTasks.map(task => (
              <div
                key={task.id}
                className={`bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
                  task.completed ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onTaskToggle(task.id)}
                    className="mt-1"
                  >
                    {task.completed ? (
                      <CheckSquare className="w-5 h-5 text-green-600" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`font-medium ${task.completed ? 'line-through text-gray-500' : ''}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <span className={`text-xs font-medium ${priorityColors[task.priority]}`}>
                            {task.priority} priority
                          </span>
                          {task.dueDate && (
                            <span className="text-xs text-gray-500">
                              Due {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                          )}
                          <div className="flex gap-1">
                            {task.tags.map(tag => (
                              <span key={tag} className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => onTaskDelete(task.id)}
                        className="text-gray-400 hover:text-red-600 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {sortedTasks.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                No tasks found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToDo;
