import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  AlertCircle,
  Loader2,
  List,
  Users,
  Edit2,
  Trash2,
  ArrowLeft, // For back button
  Eye, // For view details
} from 'lucide-react';

// Props definition for the Calendar component
interface CalendarDataConfig {
  initialView?: 'month' | 'week' | 'day';
  initialDate?: string; // ISO string e.g., "2023-10-27"
  highlightedEventId?: string;
  filter?: string; // e.g., "work", "personal" (general search term now)
}

interface CalendarProps {
  instanceId: string;
  viewMode: 'widget' | 'full';
  props?: {
    dataConfig?: CalendarDataConfig;
  };
}

// Calendar event object structure
interface CalendarEventObject {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  allDay?: boolean;
  location?: string;
  description?: string;
  color?: string; // e.g., 'blue', 'green', 'red' for event-specific coloring
  attendees?: string[];
  recurring?: string; // e.g., "weekly", "monthly" - for future use
}

// Mock data (labels removed)
const mockEvents: CalendarEventObject[] = [
  {
    id: 'event1',
    title: 'Team Meeting',
    startTime: new Date(new Date().setHours(10, 0, 0, 0)),
    endTime: new Date(new Date().setHours(11, 0, 0, 0)),
    location: 'Conference Room A',
    color: 'blue',
    attendees: ['alice@example.com', 'bob@example.com'],
  },
  {
    id: 'event2',
    title: 'Lunch with Client',
    startTime: new Date(new Date().setHours(13, 0, 0, 0)),
    endTime: new Date(new Date().setHours(14, 0, 0, 0)),
    location: 'The Grand Cafe',
    color: 'green',
  },
  {
    id: 'event3',
    title: 'Project Deadline',
    startTime: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(17, 0, 0, 0)),
    endTime: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(17, 30, 0, 0)),
    allDay: false,
    color: 'red',
    description: 'Finalize and submit the Q3 report.',
  },
  {
    id: 'event4',
    title: 'Yoga Class',
    startTime: new Date(new Date(new Date().setDate(new Date().getDate() + 2)).setHours(8, 0, 0, 0)),
    endTime: new Date(new Date(new Date().setDate(new Date().getDate() + 2)).setHours(9, 0, 0, 0)),
    location: 'Studio B',
    color: 'purple',
  },
  {
    id: 'event5',
    title: 'Dentist Appointment',
    startTime: new Date(new Date(new Date().setDate(new Date().getDate() - 1)).setHours(15, 0, 0, 0)),
    endTime: new Date(new Date(new Date().setDate(new Date().getDate() - 1)).setHours(15,45,0,0)),
    color: 'orange',
    description: 'Annual check-up.'
  },
   {
    id: 'event6',
    title: 'All Day Workshop',
    startTime: new Date(new Date().setHours(0,0,0,0)), // Today, all day
    endTime: new Date(new Date().setHours(23,59,59,999)),
    allDay: true,
    color: 'teal',
    location: 'Online'
  }
];

const Calendar: React.FC<CalendarProps> = ({ viewMode, props }) => {
  const dataConfig = props?.dataConfig;
  const [events, setEvents] = useState<CalendarEventObject[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(
    dataConfig?.initialDate ? new Date(dataConfig.initialDate) : new Date()
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventObject | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFullView, setCurrentFullView] = useState<'month' | 'week' | 'day'>(dataConfig?.initialView || 'month');


  useEffect(() => {
    setLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        let filteredEvents = [...mockEvents];
        if (dataConfig?.filter) { // Filter now acts as a general search term
          const searchTerm = dataConfig.filter.toLowerCase();
          filteredEvents = filteredEvents.filter(event => 
            event.title.toLowerCase().includes(searchTerm) ||
            (event.description && event.description.toLowerCase().includes(searchTerm)) ||
            (event.location && event.location.toLowerCase().includes(searchTerm))
          );
        }
        setEvents(filteredEvents.sort((a,b) => a.startTime.getTime() - b.startTime.getTime()));

        if (dataConfig?.highlightedEventId) {
            const eventToHighlight = filteredEvents.find(e => e.id === dataConfig.highlightedEventId);
            if (eventToHighlight) {
                setSelectedEvent(eventToHighlight);
                setCurrentDate(eventToHighlight.startTime);
                if (viewMode === 'full') setCurrentFullView('day'); // Switch to day view if highlighting an event
            }
        } else {
            setSelectedEvent(null); // Clear selection if no highlight ID
        }

      } catch (e) {
        setError('Failed to load events.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [dataConfig, viewMode]); // Added viewMode to dependencies

  const dailyEvents = useMemo(() => { // Renamed from todayEvents for clarity in full day view
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    return events
      .filter(event => {
        const eventStart = new Date(event.startTime);
        return eventStart >= dayStart && eventStart <= dayEnd;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [events, currentDate]);

  const formatEventTime = (startTime: Date, endTime: Date, allDay?: boolean) => {
    if (allDay) return 'All Day';
    const start = startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const end = endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${start} - ${end}`;
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const numDays = daysInMonth(year, month);
    const firstDay = firstDayOfMonth(year, month);
    const grid: (Date | null)[] = [];

    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let i = 1; i <= numDays; i++) grid.push(new Date(year, month, i));
    while (grid.length % 7 !== 0) grid.push(null);

    return grid;
  }, [currentDate]);

  const eventsForDateCell = (date: Date | null): CalendarEventObject[] => { // Renamed for clarity
    if (!date) return [];
    return events.filter(event => {
      const eventDate = new Date(event.startTime);
      return (
        eventDate.getFullYear() === date.getFullYear() &&
        eventDate.getMonth() === date.getMonth() &&
        eventDate.getDate() === date.getDate()
      );
    }).sort((a,b) => a.startTime.getTime() - b.startTime.getTime());
  };

  const changeMonth = (offset: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    setSelectedEvent(null); // Clear selected event when changing month
  };
  
  const handleDayCellClick = (date: Date) => { // Renamed for clarity
    setCurrentDate(date);
    setCurrentFullView('day'); 
    setSelectedEvent(null); 
  };

  const handleEventClickInDayView = (event: CalendarEventObject) => {
    setSelectedEvent(event);
    // No need to change currentFullView, it's already 'day'
  };
  
  const renderEventDetails = (event: CalendarEventObject, backAction?: () => void) => {
    return (
      <div className={`p-4 ${backAction ? 'bg-white rounded-lg shadow' : ''}`}>
        {backAction && (
          <button onClick={backAction} className="mb-3 flex items-center text-sm text-indigo-600 hover:underline">
            <ArrowLeft size={16} className="mr-1" /> Back to Day View
          </button>
        )}
        <div className="flex justify-between items-start">
            <h2 className="text-xl font-semibold text-indigo-700 mb-1">{event.title}</h2>
            {!backAction && <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>}
        </div>
        <p className="text-sm text-gray-600 flex items-center mt-1">
          <Clock size={14} className="mr-1.5"/>
          {formatEventTime(event.startTime, event.endTime, event.allDay)} on {new Date(event.startTime).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}
        </p>
        {event.location && <p className="text-sm text-gray-500 flex items-center mt-1"><MapPin size={14} className="mr-1.5"/>{event.location}</p>}
        {event.attendees && event.attendees.length > 0 && (
            <p className="text-sm text-gray-500 flex items-center mt-1"><Users size={14} className="mr-1.5"/>{event.attendees.join(', ')}</p>
        )}
        {event.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{event.description}</p>}
        <div className="mt-3 flex space-x-2">
            <button className="text-xs text-indigo-600 hover:underline flex items-center"><Edit2 size={12} className="mr-0.5"/> Edit</button>
            <button className="text-xs text-red-600 hover:underline flex items-center"><Trash2 size={12} className="mr-0.5"/> Delete</button>
        </div>
      </div>
    );
  };


  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-50 text-gray-700 ${viewMode === 'widget' ? 'aspect-[16/9]' : 'p-4'}`}>
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
        <span className="ml-2">Loading calendar...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-red-50 text-red-700 ${viewMode === 'widget' ? 'aspect-[16/9]' : 'p-4'}`}>
        <AlertCircle className="h-8 w-8 mb-2" />
        <span>{error}</span>
      </div>
    );
  }

  if (viewMode === 'widget') {
    const upcomingEvents = events.filter(e => e.startTime >= new Date()).slice(0, 4);
    return (
      <div className="bg-white text-gray-800 p-3 shadow-lg rounded-lg flex flex-col aspect-[16/9] overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-indigo-600 flex items-center">
            <CalendarDays size={20} className="mr-2" />
            Upcoming Events
          </h2>
          <span className="text-sm text-gray-500">
            {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex-grow overflow-y-auto space-y-2 pr-1">
          {upcomingEvents.length > 0 ? (
            upcomingEvents.map(event => (
              <div
                key={event.id}
                className={`p-2 rounded-md border-l-4 cursor-pointer hover:bg-gray-50`}
                style={{ borderColor: event.color || 'rgb(99 102 241)' }}
                onClick={() => alert(`Event: ${event.title}`)}
              >
                <p className="text-sm font-medium text-gray-800 truncate">{event.title}</p>
                <div className="text-xs text-gray-500 flex items-center mt-0.5">
                  <Clock size={12} className="mr-1" />
                  {formatEventTime(event.startTime, event.endTime, event.allDay)}
                </div>
                {event.location && (
                  <div className="text-xs text-gray-500 flex items-center mt-0.5">
                    <MapPin size={12} className="mr-1" />
                    {event.location}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No upcoming events.</p>
          )}
        </div>
        <button className="mt-2 text-sm text-indigo-600 hover:underline w-full text-left flex items-center">
          <Plus size={16} className="mr-1" /> Add new event
        </button>
      </div>
    );
  }

  // Full Window View
  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-800 overflow-y-auto"> {/* Added overflow-y-auto here */}
      <header className="bg-white shadow-sm p-3 flex items-center justify-between border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-md hover:bg-gray-100"><ChevronLeft size={20} /></button>
          <h1 className="text-xl font-semibold mx-3 w-32 text-center">
            {currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h1>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-md hover:bg-gray-100"><ChevronRight size={20} /></button>
          <button 
            onClick={() => { setCurrentDate(new Date()); setSelectedEvent(null); setCurrentFullView(dataConfig?.initialView || 'month');}} 
            className="ml-4 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Today
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <select 
            value={currentFullView} 
            onChange={(e) => {
                setCurrentFullView(e.target.value as 'month'|'week'|'day');
                setSelectedEvent(null); // Clear selection when changing view type
            }}
            className="text-sm border border-gray-300 rounded-md p-1.5 hover:bg-gray-100 focus:outline-none"
          >
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="day">Day</option>
          </select>
          <button className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 flex items-center">
            <Plus size={18} className="mr-1" /> Create
          </button>
        </div>
      </header>

      <div className="flex-grow p-2 md:p-4">
          {currentFullView === 'month' && (
            <>
              <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center py-2 text-xs font-medium text-gray-600 bg-gray-100">{day}</div>
                ))}
                {monthGrid.map((date, index) => (
                  <div
                    key={index}
                    className={`p-1.5 min-h-[6rem] md:min-h-[8rem] bg-white relative ${date ? 'cursor-pointer hover:bg-indigo-50' : 'bg-gray-50'}`}
                    onClick={() => date && handleDayCellClick(date)}
                  >
                    {date && (
                      <>
                        <span className={`text-xs ${
                          date.toDateString() === new Date().toDateString() ? 'bg-indigo-600 text-white rounded-full px-1.5 py-0.5' : 'text-gray-700'
                        }`}>
                          {date.getDate()}
                        </span>
                        <div className="mt-1 space-y-0.5 overflow-hidden max-h-[calc(100%-1.5rem)]">
                          {eventsForDateCell(date).slice(0,2).map(event => (
                            <div 
                                key={event.id} 
                                className="text-xs p-0.5 rounded truncate cursor-pointer" 
                                style={{backgroundColor: `${event.color}20`, color: event.color, borderColor: event.color}} 
                                onClick={(e) => {e.stopPropagation(); setSelectedEvent(event); setCurrentDate(date);}}
                            >
                              {event.title}
                            </div>
                          ))}
                          {eventsForDateCell(date).length > 2 && <div className="text-xs text-gray-500 mt-0.5">+{eventsForDateCell(date).length - 2} more</div>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {selectedEvent && ( // Show details below month grid if an event is selected
                <div className="mt-4"> 
                    {renderEventDetails(selectedEvent)}
                </div>
              )}
            </>
          )}

          {currentFullView === 'day' && (
            selectedEvent ? ( // If an event is selected in day view, show its details
                renderEventDetails(selectedEvent, () => setSelectedEvent(null))
            ) : ( // Otherwise, show the list of daily events
                <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-3 text-indigo-700">
                    {currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h2>
                <div className="space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto pr-2"> {/* Adjusted max height */}
                    {dailyEvents.length > 0 ? (
                    dailyEvents.map(event => (
                        <div key={event.id} className="p-3 rounded-md shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{borderColor: event.color || 'rgb(99 102 241)'}}>
                        <h3 className="font-semibold text-gray-800">{event.title}</h3>
                        <p className="text-sm text-gray-600 flex items-center"><Clock size={14} className="mr-1.5"/>{formatEventTime(event.startTime, event.endTime, event.allDay)}</p>
                        {event.location && <p className="text-sm text-gray-500 flex items-center"><MapPin size={14} className="mr-1.5"/>{event.location}</p>}
                        {event.description && <p className="text-xs text-gray-500 mt-1 truncate">{event.description}</p>}
                        <div className="mt-2 flex space-x-2">
                            <button onClick={() => handleEventClickInDayView(event)} className="text-xs text-indigo-600 hover:underline flex items-center"><Eye size={12} className="mr-0.5"/> View Details</button>
                            <button onClick={() => handleEventClickInDayView(event)} className="text-xs text-gray-600 hover:underline flex items-center"><Edit2 size={12} className="mr-0.5"/> Edit</button>
                        </div>
                        </div>
                    ))
                    ) : (
                    <p className="text-gray-500">No events scheduled for this day.</p>
                    )}
                </div>
                </div>
            )
          )}
          
          {currentFullView === 'week' && (
             <div className="bg-white p-4 rounded-lg shadow text-center text-gray-500 h-full flex flex-col justify-center items-center">
                <List size={48} className="mx-auto mb-4 text-gray-400"/>
                <p className="text-lg">Week View is Under Construction</p>
                <p className="text-sm">Please select Month or Day view for now.</p>
             </div>
          )}
        </div>
    </div>
  );
};

export default Calendar;