import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import React from 'react';

interface Event {
  id: string;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  color: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface CalendarProps {
  isWidget?: boolean;
  currentDate?: Date;
  view?: 'month' | 'week' | 'day';
  events?: Event[];
  selectedEvent?: string | null;
  onDateChange?: (date: Date) => void;
  onViewChange?: (view: 'month' | 'week' | 'day') => void;
  onEventClick?: (id: string) => void;
  onEventCreate?: (event: Omit<Event, 'id'>) => void;
  onEventUpdate?: (id: string, event: Partial<Event>) => void;
  onEventDelete?: (id: string) => void;
}

const defaultEvents: Event[] = [
  {
    id: '1',
    title: 'Team Standup',
    date: new Date('2024-01-15'),
    startTime: '09:00',
    endTime: '09:30',
    color: '#3B82F6',
    description: 'Daily team sync',
    attendees: ['John', 'Jane', 'Bob']
  },
  {
    id: '2',
    title: 'Product Review',
    date: new Date('2024-01-15'),
    startTime: '14:00',
    endTime: '15:00',
    color: '#10B981',
    location: 'Conference Room A'
  },
  {
    id: '3',
    title: 'Client Call',
    date: new Date('2024-01-16'),
    startTime: '11:00',
    endTime: '12:00',
    color: '#F59E0B',
    description: 'Q1 planning discussion'
  }
];

const Calendar: React.FC<CalendarProps> = ({
  isWidget = false,
  currentDate = new Date(),
  view = 'month',
  events = defaultEvents,
  selectedEvent = null,
  onDateChange = () => {},
  onViewChange = () => {},
  onEventClick = () => {},
  onEventCreate = () => {},
  onEventUpdate = () => {},
  onEventDelete = () => {}
}) => {
  const today = new Date();
  const todayEvents = events.filter(event => 
    event.date.toDateString() === today.toDateString()
  );

  if (isWidget) {
    // Widget view - display only, no interactions
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-purple-600" />
              <span className="font-medium text-gray-900">Calendar</span>
            </div>
            <span className="text-xs text-gray-500">
              {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
        
        {/* Events list - takes available space */}
        <div className="flex-1 px-4 py-2 overflow-hidden">
          {todayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <CalendarIcon className="w-8 h-8 mb-2 opacity-50" />
              <div className="text-sm">No events today</div>
            </div>
          ) : (
            <div className="space-y-3">
              {todayEvents.slice(0, 3).map(event => (
                <div key={event.id} className="-mx-2 px-2 py-2">
                  <div className="flex items-start gap-3">
                    <div 
                      className="flex-shrink-0 w-1 h-12 rounded-full" 
                      style={{ backgroundColor: event.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{event.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {event.startTime} - {event.endTime}
                      </div>
                      {event.location && (
                        <div className="text-xs text-gray-400 truncate mt-1">{event.location}</div>
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
            {events.length} total events
          </div>
        </div>
      </div>
    );
  }

  // Full window view
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  
  const renderMonthView = () => {
    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2 border border-gray-100" />);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayEvents = events.filter(event => 
        event.date.toDateString() === date.toDateString()
      );
      const isToday = date.toDateString() === today.toDateString();
      
      days.push(
        <div 
          key={day} 
          className={`p-2 border border-gray-100 min-h-24 ${
            isToday ? 'bg-purple-50' : 'hover:bg-gray-50'
          }`}
        >
          <div className={`text-sm mb-1 ${isToday ? 'font-bold text-purple-600' : ''}`}>
            {day}
          </div>
          <div className="space-y-1">
            {dayEvents.slice(0, 3).map(event => (
              <div
                key={event.id}
                onClick={() => onEventClick(event.id)}
                className="text-xs p-1 rounded cursor-pointer truncate"
                style={{ backgroundColor: event.color + '20', color: event.color }}
              >
                {event.startTime} {event.title}
              </div>
            ))}
            {dayEvents.length > 3 && (
              <div className="text-xs text-gray-500">+{dayEvents.length - 3} more</div>
            )}
          </div>
        </div>
      );
    }
    
    return days;
  };

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <button
          onClick={() => onEventCreate({
            title: 'New Event',
            date: new Date(),
            startTime: '09:00',
            endTime: '10:00',
            color: '#3B82F6'
          })}
          className="w-full bg-purple-600 text-white rounded-lg py-2 px-4 mb-6 flex items-center justify-center gap-2 hover:bg-purple-700"
        >
          <Plus className="w-4 h-4" />
          Create Event
        </button>
        
        <div className="mb-6">
          <div className="text-sm font-medium text-gray-700 mb-2">View</div>
          <div className="space-y-1">
            {(['month', 'week', 'day'] as const).map(v => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`w-full text-left px-3 py-2 rounded-lg capitalize ${
                  view === v ? 'bg-purple-50 text-purple-600' : 'hover:bg-gray-100'
                }`}
              >
                {v} View
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Upcoming Events</div>
          <div className="space-y-2">
            {events.slice(0, 5).map(event => (
              <div 
                key={event.id}
                onClick={() => onEventClick(event.id)}
                className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <div className="flex items-start gap-2">
                  <div 
                    className="w-2 h-2 rounded-full mt-1.5" 
                    style={{ backgroundColor: event.color }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{event.title}</div>
                    <div className="text-xs text-gray-500">
                      {event.date.toLocaleDateString()} at {event.startTime}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Calendar */}
      <div className="flex-1 bg-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const newDate = new Date(currentDate);
                newDate.setMonth(newDate.getMonth() - 1);
                onDateChange(newDate);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-semibold">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button
              onClick={() => {
                const newDate = new Date(currentDate);
                newDate.setMonth(newDate.getMonth() + 1);
                onDateChange(newDate);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => onDateChange(new Date())}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Today
          </button>
        </div>

        {/* Calendar Grid */}
        {view === 'month' && (
          <>
            <div className="grid grid-cols-7 gap-0 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-sm font-medium text-gray-700 p-2 text-center">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0">
              {renderMonthView()}
            </div>
          </>
        )}

        {view === 'week' && (
          <div className="text-center text-gray-500 py-20">
            Week view would be implemented here
          </div>
        )}

        {view === 'day' && (
          <div className="text-center text-gray-500 py-20">
            Day view would be implemented here
          </div>
        )}
      </div>

      {/* Event Details Modal (simplified) */}
      {selectedEvent && (
        <div className="w-96 bg-white border-l border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Event Details</h3>
            <button
              onClick={() => onEventClick('')}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          {/* Event details would go here */}
          <div className="text-gray-500">Event details panel</div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
