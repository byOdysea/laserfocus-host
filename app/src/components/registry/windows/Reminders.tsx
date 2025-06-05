import React, { useState, useEffect } from 'react';

// Interfaces
interface Reminder {
  id: string;
  text: string;
  dueDate: Date | null;
  list: string; // e.g., 'Personal', 'Work'
  isCompleted: boolean;
  createdAt: Date;
}

interface RemindersDataConfig {
  filter?: 'all' | 'today' | 'upcoming' | 'completed';
  selectedList?: string | null; // To filter by a specific list like 'Work' or 'Personal'
  directReminderId?: string | null; // To show a specific reminder
  sortBy?: 'dueDate' | 'createdAt' | 'text';
}

export interface RemindersProps {
  instanceId: string;
  viewMode: 'widget' | 'full';
  props?: {
    dataConfig?: RemindersDataConfig;
  };
  // onInteraction?: (interaction: any) => void; // For future use
}

// Mock Data
const mockReminders: Reminder[] = [
  { id: 'r1', text: 'Submit project proposal', dueDate: new Date(Date.now() + 86400000 * 1), list: 'Work', isCompleted: false, createdAt: new Date(Date.now() - 86400000 * 2) },
  { id: 'r2', text: 'Call Dr. Smith', dueDate: new Date(Date.now() + 86400000 * 0.5), list: 'Personal', isCompleted: false, createdAt: new Date(Date.now() - 86400000 * 1) },
  { id: 'r3', text: 'Buy groceries for the week', dueDate: null, list: 'Personal', isCompleted: false, createdAt: new Date(Date.now() - 86400000 * 3) },
  { id: 'r4', text: 'Team meeting for Q4 planning', dueDate: new Date(Date.now() + 86400000 * 3), list: 'Work', isCompleted: false, createdAt: new Date() },
  { id: 'r5', text: 'Pay electricity bill', dueDate: new Date(Date.now() - 86400000 * 1), list: 'Personal', isCompleted: true, createdAt: new Date(Date.now() - 86400000 * 5) },
  { id: 'r6', text: 'Prepare presentation slides', dueDate: new Date(Date.now() + 86400000 * 2), list: 'Work', isCompleted: false, createdAt: new Date(Date.now() - 86400000 * 0.5) },
];

const Reminders: React.FC<RemindersProps> = ({ instanceId, viewMode, props }) => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  // const [availableLists, setAvailableLists] = useState<string[]>(mockLists); // For future use with list management

  useEffect(() => {
    console.log(`Reminders component (${instanceId}) initializing with config:`, props?.dataConfig);
    let processedReminders = [...mockReminders];

    const config = props?.dataConfig;

    if (config?.directReminderId) {
      const direct = processedReminders.find(r => r.id === config.directReminderId);
      processedReminders = direct ? [direct] : [];
    } else {
      if (config?.selectedList) {
        processedReminders = processedReminders.filter(r => r.list === config.selectedList);
      }

      switch (config?.filter) {
        case 'today':
          processedReminders = processedReminders.filter(r => {
            if (!r.dueDate) return false;
            const today = new Date();
            return r.dueDate.getFullYear() === today.getFullYear() &&
                   r.dueDate.getMonth() === today.getMonth() &&
                   r.dueDate.getDate() === today.getDate() &&
                   !r.isCompleted;
          });
          break;
        case 'upcoming':
          processedReminders = processedReminders.filter(r => r.dueDate && r.dueDate.getTime() > Date.now() && !r.isCompleted);
          break;
        case 'completed':
          processedReminders = processedReminders.filter(r => r.isCompleted);
          break;
        case 'all':
        default:
          // No additional filtering based on completion status unless specified
          break;
      }
    }
    
    // Sorting (ensure non-completed are prioritized if sorting by due date)
    if (config?.sortBy === 'dueDate') {
        processedReminders.sort((a, b) => {
            if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.getTime() - b.dueDate.getTime();
        });
    } else if (config?.sortBy === 'createdAt') {
        processedReminders.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else if (config?.sortBy === 'text') {
        processedReminders.sort((a,b) => a.text.localeCompare(b.text));
    } else { // Default sort: non-completed by due date (soonest first), then completed by due date
        processedReminders.sort((a, b) => {
            if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
            if (!a.dueDate) return 1; // No due date to the end
            if (!b.dueDate) return -1;
            return a.dueDate.getTime() - b.dueDate.getTime();
        });
    }


    setReminders(processedReminders);

    if (processedReminders.length > 0) {
      setSelectedReminder(processedReminders[0]);
    } else {
      setSelectedReminder(null);
    }

  }, [props?.dataConfig, instanceId]);

  const handleReminderSelect = (reminder: Reminder) => {
    setSelectedReminder(reminder);
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
    backgroundColor: '#f0f4f8', // Light blueish background
    color: '#2c3e50', // Dark blue-gray text
  };

  // Widget View
  if (viewMode === 'widget') {
    const upcomingReminder = reminders.find(r => !r.isCompleted && r.dueDate && r.dueDate.getTime() >= Date.now()) || reminders.find(r => !r.isCompleted);
    const widgetStyle: React.CSSProperties = {
      ...baseStyle,
      borderRadius: '10px',
      boxShadow: '0 5px 15px rgba(0,0,0,0.07)',
      backgroundColor: '#ffffff',
      padding: '18px',
      justifyContent: 'center',
      alignItems: 'flex-start',
    };
    const widgetTitleStyle: React.CSSProperties = { margin: '0 0 14px 0', fontSize: '1.15em', color: '#34495e', fontWeight: 600 };
    const reminderTextStyle: React.CSSProperties = { margin: '0 0 6px 0', fontSize: '0.9em', fontWeight: 500, color: '#34495e' };
    const reminderDateStyle: React.CSSProperties = { fontSize: '0.8em', color: '#7f8c8d' };
    const noReminderStyle: React.CSSProperties = { fontSize: '0.9em', color: '#7f8c8d', textAlign: 'center', width: '100%', marginTop: '10px' };
    const widgetFooterStyle: React.CSSProperties = { fontSize: '0.75em', color: '#95a5a6', marginTop: 'auto', paddingTop: '10px', textAlign: 'right', width: '100%' };


    return (
      <div style={widgetStyle}>
        <h3 style={widgetTitleStyle}>Next Up</h3>
        {upcomingReminder ? (
          <div>
            <p style={reminderTextStyle}>{upcomingReminder.text}</p>
            {upcomingReminder.dueDate && <p style={reminderDateStyle}>Due: {new Date(upcomingReminder.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
          </div>
        ) : (
          <p style={noReminderStyle}>No upcoming reminders.</p>
        )}
        <p style={widgetFooterStyle}>{reminders.filter(r => !r.isCompleted).length} active</p>
      </div>
    );
  }

  // Full View (Portrait Optimized)
  const fullViewStyle: React.CSSProperties = { ...baseStyle, flexDirection: 'row' };
  const listPaneStyle: React.CSSProperties = {
    ...commonBoxSizing,
    width: '320px',
    minWidth: '240px',
    maxWidth: '40%',
    borderRight: '1px solid #d1d8e0',
    overflowY: 'auto',
    padding: '15px',
    backgroundColor: '#e9eef2'
  };
  const listTitleStyle: React.CSSProperties = { marginTop: '0', marginBottom: '15px', fontSize: '1.3em', color: '#2c3e50', fontWeight: 600, paddingLeft: '5px' };
  const listItemStyleBase: React.CSSProperties = {
    ...commonBoxSizing,
    padding: '12px 15px',
    marginBottom: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d8e0',
    transition: 'background-color 0.2s ease, transform 0.1s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  };
  const listItemTextStyle: React.CSSProperties = { fontWeight: 500, marginBottom: '5px', fontSize: '0.95em', color: '#34495e' };
  const listItemDateStyle: React.CSSProperties = { fontSize: '0.8em', color: '#7f8c8d' };
  const listItemCompletedStyle: React.CSSProperties = { textDecoration: 'line-through', color: '#95a5a6' };

  const detailPaneStyle: React.CSSProperties = { ...commonBoxSizing, flexGrow: 1, padding: '30px', overflowY: 'auto' };
  const detailTextStyle: React.CSSProperties = { fontSize: '1.7em', marginBottom: '10px', color: '#162029', fontWeight: 600, lineHeight: 1.3 };
  const detailMetaStyle: React.CSSProperties = { fontSize: '0.9em', color: '#566573', marginBottom: '25px' };
  const detailStatusStyle: React.CSSProperties = { fontSize: '0.9em', fontWeight: 500 };

  return (
    <div style={fullViewStyle}>
      <style>{`.reminder-list-item:hover { background-color: #f8f9fa; transform: translateY(-1px); }`}</style>
      <div style={listPaneStyle}>
        <h3 style={listTitleStyle}>{props?.dataConfig?.selectedList || 'All Reminders'}</h3>
        {reminders.length > 0 ? (
          reminders.map(reminder => {
            const isSelected = selectedReminder?.id === reminder.id;
            const itemStyle: React.CSSProperties = {
              ...listItemStyleBase,
              backgroundColor: isSelected ? '#d6e4f0' : '#ffffff',
              borderColor: isSelected ? '#b0c4de' : '#d1d8e0',
              boxShadow: isSelected ? '0 3px 7px rgba(0,0,0,0.08)' : '0 2px 4px rgba(0,0,0,0.05)',
            };
            const textStyle = reminder.isCompleted ? {...listItemTextStyle, ...listItemCompletedStyle} : listItemTextStyle;
            return (
              <div
                key={reminder.id}
                className="reminder-list-item"
                style={itemStyle}
                onClick={() => handleReminderSelect(reminder)}
                title={reminder.text}
              >
                <div style={textStyle}>{reminder.text}</div>
                {reminder.dueDate && (
                  <div style={reminder.isCompleted ? {...listItemDateStyle, ...listItemCompletedStyle} : listItemDateStyle}>
                    Due: {new Date(reminder.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
                {!reminder.dueDate && <div style={listItemDateStyle}>No due date</div>}
              </div>
            );
          })
        ) : (
          <p style={{textAlign: 'center', color: '#7f8c8d', marginTop: '25px'}}>No reminders in this view.</p>
        )}
      </div>
      <div style={detailPaneStyle}>
        {selectedReminder ? (
          <>
            <h2 style={detailTextStyle}>{selectedReminder.text}</h2>
            <p style={detailMetaStyle}>
              List: {selectedReminder.list}
              {selectedReminder.dueDate && ` | Due: ${new Date(selectedReminder.dueDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </p>
            <p style={{...detailStatusStyle, color: selectedReminder.isCompleted ? '#27ae60' : '#e74c3c' }}>
              Status: {selectedReminder.isCompleted ? 'Completed' : 'Pending'}
            </p>
            {/* More details can be added here, e.g., notes, subtasks, etc. */}
          </>
        ) : (
          <div style={{display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d'}}>
            <p>Select a reminder to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reminders;