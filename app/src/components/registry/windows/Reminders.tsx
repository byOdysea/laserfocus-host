import { Bell, Calendar, Clock, MapPin, Plus, Repeat } from 'lucide-react';
import React from 'react';

interface Reminder {
  id: string;
  title: string;
  notes?: string;
  datetime?: Date;
  location?: string;
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  list: string;
}

interface RemindersProps {
  isWidget?: boolean;
  reminders?: Reminder[];
  selectedReminder?: string | null;
  selectedList?: string | null;
  filter?: 'all' | 'today' | 'upcoming' | 'completed' | 'overdue';
  onReminderSelect?: (id: string) => void;
  onReminderCreate?: (reminder: Omit<Reminder, 'id'>) => void;
  onReminderUpdate?: (id: string, reminder: Partial<Reminder>) => void;
  onReminderDelete?: (id: string) => void;
  onReminderComplete?: (id: string) => void;
  onListSelect?: (list: string | null) => void;
  onFilterChange?: (filter: string) => void;
}

const defaultReminders: Reminder[] = [
  {
    id: '1',
    title: 'Doctor appointment',
    notes: 'Annual checkup',
    datetime: new Date('2024-01-16T14:00:00'),
    location: 'Medical Center, 123 Health St',
    isCompleted: false,
    priority: 'high',
    repeat: 'yearly',
    list: 'Personal'
  },
  {
    id: '2',
    title: 'Pay electricity bill',
    datetime: new Date('2024-01-20T09:00:00'),
    isCompleted: false,
    priority: 'medium',
    repeat: 'monthly',
    list: 'Bills'
  },
  {
    id: '3',
    title: 'Team lunch',
    notes: 'Celebrating Q4 success',
    datetime: new Date('2024-01-15T12:30:00'),
    location: 'Italian Restaurant Downtown',
    isCompleted: false,
    priority: 'low',
    repeat: 'none',
    list: 'Work'
  },
  {
    id: '4',
    title: 'Water plants',
    isCompleted: false,
    priority: 'low',
    repeat: 'weekly',
    list: 'Home'
  }
];

const priorityColors = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700'
};

const Reminders: React.FC<RemindersProps> = ({
  isWidget = false,
  reminders = defaultReminders,
  selectedReminder = null,
  selectedList = null,
  filter = 'all',
  onReminderSelect = () => {},
  onReminderCreate = () => {},
  onReminderUpdate = () => {},
  onReminderDelete = () => {},
  onReminderComplete = () => {},
  onListSelect = () => {},
  onFilterChange = () => {}
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayReminders = reminders.filter(r => 
    !r.isCompleted && r.datetime && 
    new Date(r.datetime).toDateString() === today.toDateString()
  );

  const upcomingReminders = reminders.filter(r => 
    !r.isCompleted && (!r.datetime || new Date(r.datetime) >= today)
  ).sort((a, b) => {
    if (!a.datetime) return 1;
    if (!b.datetime) return -1;
    return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
  });

  if (isWidget) {
    // Widget view - display only, no interactions
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-600" />
              <span className="font-medium text-gray-900">Reminders</span>
            </div>
            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
              {todayReminders.length}
            </span>
          </div>
        </div>
        
        {/* Reminders list - takes available space */}
        <div className="flex-1 px-4 py-2 overflow-hidden">
          {upcomingReminders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Bell className="w-8 h-8 mb-2 opacity-50" />
              <div className="text-sm">No reminders</div>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReminders.slice(0, 3).map(reminder => (
                <div key={reminder.id} className="-mx-2 px-2 py-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{reminder.title}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[reminder.priority]}`}>
                          {reminder.priority}
                        </span>
                        <span className="text-xs text-gray-500">
                          {reminder.datetime ? new Date(reminder.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                        </span>
                      </div>
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
            {upcomingReminders.length} upcoming
          </div>
        </div>
      </div>
    );
  }

  // Full window view
  const lists = Array.from(new Set(reminders.map(r => r.list)));
  
  const filteredReminders = reminders.filter(reminder => {
    if (selectedList && reminder.list !== selectedList) {
      return false;
    }
    
    switch (filter) {
      case 'today':
        return reminder.datetime && 
               new Date(reminder.datetime).toDateString() === today.toDateString();
      case 'upcoming':
        return !reminder.isCompleted && 
               (!reminder.datetime || new Date(reminder.datetime) >= today);
      case 'completed':
        return reminder.isCompleted;
      case 'overdue':
        return !reminder.isCompleted && 
               reminder.datetime && 
               new Date(reminder.datetime) < today;
      default:
        return true;
    }
  });

  const sortedReminders = [...filteredReminders].sort((a, b) => {
    // Completed reminders go to bottom
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    // Sort by date
    if (!a.datetime) return 1;
    if (!b.datetime) return -1;
    return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
  });

  const selectedReminderData = reminders.find(r => r.id === selectedReminder);

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <button
          onClick={() => onReminderCreate({
            title: 'New Reminder',
            isCompleted: false,
            priority: 'medium',
            repeat: 'none',
            list: 'Personal'
          })}
          className="w-full bg-red-600 text-white rounded-lg py-2 px-4 mb-6 flex items-center justify-center gap-2 hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          New Reminder
        </button>
        
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 mb-2">Filter</div>
          <div className="space-y-1">
            {['all', 'today', 'upcoming', 'completed', 'overdue'].map(f => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={`w-full text-left px-3 py-2 rounded-lg capitalize ${
                  filter === f ? 'bg-red-50 text-red-600' : 'hover:bg-gray-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Lists</div>
          <div className="space-y-1">
            <button
              onClick={() => onListSelect(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                !selectedList ? 'bg-red-50 text-red-600' : 'hover:bg-gray-100'
              }`}
            >
              All Lists
            </button>
            {lists.map(list => (
              <button
                key={list}
                onClick={() => onListSelect(list)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  selectedList === list ? 'bg-red-50 text-red-600' : 'hover:bg-gray-100'
                }`}
              >
                {list}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Reminders</h2>
          
          <div className="space-y-2">
            {sortedReminders.map(reminder => (
              <div
                key={reminder.id}
                onClick={() => onReminderSelect(reminder.id)}
                className={`bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                  reminder.isCompleted ? 'opacity-60' : ''
                } ${selectedReminder === reminder.id ? 'ring-2 ring-red-500' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReminderComplete(reminder.id);
                    }}
                    className={`w-5 h-5 rounded-full border-2 mt-0.5 ${
                      reminder.isCompleted 
                        ? 'bg-red-600 border-red-600' 
                        : 'border-gray-300 hover:border-red-600'
                    }`}
                  >
                    {reminder.isCompleted && (
                      <svg className="w-3 h-3 text-white mx-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className={`font-medium ${reminder.isCompleted ? 'line-through text-gray-500' : ''}`}>
                          {reminder.title}
                        </h3>
                        
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                          {reminder.datetime && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(reminder.datetime).toLocaleString()}
                            </div>
                          )}
                          {reminder.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {reminder.location}
                            </div>
                          )}
                          {reminder.repeat && reminder.repeat !== 'none' && (
                            <div className="flex items-center gap-1">
                              <Repeat className="w-3 h-3" />
                              {reminder.repeat}
                            </div>
                          )}
                        </div>
                        
                        {reminder.notes && (
                          <p className="text-sm text-gray-600 mt-2">{reminder.notes}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${priorityColors[reminder.priority]}`}>
                          {reminder.priority}
                        </span>
                        <span className="text-xs text-gray-500">{reminder.list}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {sortedReminders.length === 0 && (
              <div className="text-center text-gray-500 py-12">
                No reminders found
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedReminderData && (
        <div className="w-96 bg-white border-l border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Reminder Details</h3>
            <button
              onClick={() => onReminderSelect('')}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                className="mt-1 w-full p-2 border border-gray-300 rounded"
                value={selectedReminderData.title}
                readOnly
              />
            </div>
            
            {selectedReminderData.datetime && (
              <div>
                <label className="text-sm font-medium text-gray-700">Date & Time</label>
                <div className="mt-1 text-sm">{new Date(selectedReminderData.datetime).toLocaleString()}</div>
              </div>
            )}
            
            {selectedReminderData.location && (
              <div>
                <label className="text-sm font-medium text-gray-700">Location</label>
                <div className="mt-1 text-sm">{selectedReminderData.location}</div>
              </div>
            )}
            
            {selectedReminderData.notes && (
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <div className="mt-1 text-sm">{selectedReminderData.notes}</div>
              </div>
            )}
            
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => onReminderDelete(selectedReminderData.id)}
                className="text-red-600 hover:text-red-700 text-sm"
              >
                Delete Reminder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reminders;
