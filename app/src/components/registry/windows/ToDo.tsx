import React, { useState, useEffect } from 'react';

// Interfaces
interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  tags: string[]; // Kept for structure, but not used in MVP display
  createdAt: Date;
}

interface ToDoDataConfig {
  initialFilter?: 'all' | 'active' | 'completed' | 'today' | 'upcoming';
  initialSortBy?: 'priority' | 'dueDate' | 'createdAt' | 'title';
  initialSelectedTags?: string[]; // Kept for structure
  initialSearchQuery?: string; // Kept for structure
  directTaskId?: string;
}

export interface ToDoProps {
  instanceId: string;
  viewMode: 'widget' | 'full';
  props?: {
    dataConfig?: ToDoDataConfig;
  };
  // onInteraction?: (interaction: any) => void; // For future use
}

// Mock Data
const mockTasks: Task[] = [
  { id: 't1', title: 'Finalize Q3 report', description: 'Compile all data and write summary.', completed: false, priority: 'high', dueDate: new Date(Date.now() + 86400000 * 2), tags: ['work', 'report'], createdAt: new Date(Date.now() - 86400000 * 5) },
  { id: 't2', title: 'Schedule dentist appointment', description: 'Routine check-up.', completed: false, priority: 'medium', dueDate: new Date(Date.now() + 86400000 * 7), tags: ['personal', 'health'], createdAt: new Date(Date.now() - 86400000 * 3) },
  { id: 't3', title: 'Buy birthday gift for Alice', description: 'Needs to be something special.', completed: false, priority: 'high', dueDate: new Date(Date.now() + 86400000 * 4), tags: ['personal', 'gift'], createdAt: new Date(Date.now() - 86400000 * 1) },
  { id: 't4', title: 'Renew gym membership', description: '', completed: true, priority: 'low', dueDate: new Date(Date.now() - 86400000 * 10), tags: ['personal', 'health'], createdAt: new Date(Date.now() - 86400000 * 15) },
  { id: 't5', title: 'Research new Javascript frameworks', description: 'Look into Svelte and SolidJS.', completed: false, priority: 'medium', tags: ['work', 'learning'], createdAt: new Date(Date.now() - 86400000 * 0.5) },
];

const priorityMap: { [key in Task['priority']]: number } = { high: 1, medium: 2, low: 3 };

const ToDo: React.FC<ToDoProps> = ({ instanceId, viewMode, props }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    console.log(`ToDo component (${instanceId}) initializing with config:`, props?.dataConfig);
    let processedTasks = [...mockTasks];
    const config = props?.dataConfig;

    if (config?.directTaskId) {
        const direct = processedTasks.find(t => t.id === config.directTaskId);
        processedTasks = direct ? [direct] : [];
    } else {
        // Filtering
        switch (config?.initialFilter) {
        case 'active':
            processedTasks = processedTasks.filter(task => !task.completed);
            break;
        case 'completed':
            processedTasks = processedTasks.filter(task => task.completed);
            break;
        case 'today':
            processedTasks = processedTasks.filter(task => {
            if (!task.dueDate) return false;
            const today = new Date();
            return task.dueDate.getFullYear() === today.getFullYear() &&
                    task.dueDate.getMonth() === today.getMonth() &&
                    task.dueDate.getDate() === today.getDate() &&
                    !task.completed;
            });
            break;
        case 'upcoming':
            processedTasks = processedTasks.filter(task => task.dueDate && task.dueDate.getTime() > Date.now() && !task.completed);
            break;
        case 'all':
        default:
            // No change
            break;
        }
    }

    // Sorting
    switch (config?.initialSortBy) {
      case 'priority':
        processedTasks.sort((a, b) => priorityMap[a.priority] - priorityMap[b.priority] || (a.dueDate && b.dueDate ? a.dueDate.getTime() - b.dueDate.getTime() : 0));
        break;
      case 'dueDate':
        processedTasks.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        });
        break;
      case 'createdAt':
        processedTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case 'title':
        processedTasks.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default: // Default sort: active by priority then due date, then completed by due date
        processedTasks.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            const priorityDiff = priorityMap[a.priority] - priorityMap[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.getTime() - b.dueDate.getTime();
        });
        break;
    }

    setTasks(processedTasks);
    if (processedTasks.length > 0) {
      setSelectedTask(processedTasks[0]);
    } else {
      setSelectedTask(null);
    }
  }, [props?.dataConfig, instanceId]);

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
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
    backgroundColor: '#f8f9fa', // Very light gray background
    color: '#212529', // Dark text
  };

  const getPriorityColor = (priority: Task['priority']): string => {
    if (priority === 'high') return '#e74c3c'; // Red
    if (priority === 'medium') return '#f39c12'; // Orange
    return '#2ecc71'; // Green
  };
  
  // Widget View
  if (viewMode === 'widget') {
    const activeTasks = tasks.filter(t => !t.completed);
    const nextDueTask = [...activeTasks].sort((a,b) => (a.dueDate?.getTime() || Infinity) - (b.dueDate?.getTime() || Infinity))[0];

    const widgetStyle: React.CSSProperties = {
      ...baseStyle,
      borderRadius: '12px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
      backgroundColor: '#ffffff',
      padding: '20px',
      justifyContent: 'space-between',
    };
    const widgetHeaderStyle: React.CSSProperties = { margin: '0 0 15px 0', fontSize: '1.2em', color: '#343a40', fontWeight: 600 };
    const taskSummaryStyle: React.CSSProperties = { fontSize: '0.95em', color: '#495057', marginBottom: '10px' };
    const nextTaskTitleStyle: React.CSSProperties = { fontWeight: 500, margin: '0 0 5px 0', fontSize: '0.9em', color: '#343a40' };
    const nextTaskDateStyle: React.CSSProperties = { fontSize: '0.8em', color: '#6c757d' };
    const noTasksStyle: React.CSSProperties = { fontSize: '0.9em', color: '#6c757d', textAlign: 'center', width: '100%', marginTop: '10px' };

    return (
      <div style={widgetStyle}>
        <div>
            <h3 style={widgetHeaderStyle}>Task Overview</h3>
            <p style={taskSummaryStyle}>
                {activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''}.
            </p>
            {nextDueTask ? (
            <div>
                <p style={{...nextTaskTitleStyle, borderLeft: `3px solid ${getPriorityColor(nextDueTask.priority)}`, paddingLeft: '8px'}}>
                    {nextDueTask.title}
                </p>
                {nextDueTask.dueDate && <p style={nextTaskDateStyle}>Due: {new Date(nextDueTask.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
            </div>
            ) : (
            activeTasks.length === 0 && tasks.length > 0 ? <p style={noTasksStyle}>All tasks completed!</p> : <p style={noTasksStyle}>No active tasks.</p>
            )}
        </div>
        <div style={{fontSize: '0.75em', color: '#adb5bd', textAlign: 'right', marginTop: '15px'}}>
            Total: {tasks.length}
        </div>
      </div>
    );
  }

  // Full View (Portrait Optimized)
  const fullViewStyle: React.CSSProperties = { ...baseStyle, flexDirection: 'row' };
  const listPaneStyle: React.CSSProperties = {
    ...commonBoxSizing,
    width: '350px',
    minWidth: '280px',
    maxWidth: '45%',
    borderRight: '1px solid #dee2e6',
    overflowY: 'auto',
    padding: '18px',
    backgroundColor: '#e9ecef'
  };
  const listTitleStyle: React.CSSProperties = { marginTop: '0', marginBottom: '18px', fontSize: '1.4em', color: '#343a40', fontWeight: 600, paddingLeft: '5px' };
  const listItemStyleBase: React.CSSProperties = {
    ...commonBoxSizing,
    padding: '14px 18px',
    marginBottom: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
    boxShadow: '0 2px 5px rgba(0,0,0,0.06)',
  };
  const listItemTitleStyle: React.CSSProperties = { fontWeight: 500, marginBottom: '6px', fontSize: '1em', color: '#212529' };
  const listItemDateStyle: React.CSSProperties = { fontSize: '0.85em', color: '#6c757d' };
  const listItemCompletedStyle: React.CSSProperties = { opacity: 0.7, textDecoration: 'line-through' };

  const detailPaneStyle: React.CSSProperties = { ...commonBoxSizing, flexGrow: 1, padding: '35px', overflowY: 'auto' };
  const detailTitleStyle: React.CSSProperties = { fontSize: '1.8em', marginBottom: '12px', color: '#212529', fontWeight: 600, lineHeight: 1.3 };
  const detailDescStyle: React.CSSProperties = { fontSize: '1em', color: '#495057', marginBottom: '20px', lineHeight: 1.6, whiteSpace: 'pre-wrap' };
  const detailMetaStyle: React.CSSProperties = { fontSize: '0.9em', color: '#6c757d', marginBottom: '8px' };

  return (
    <div style={fullViewStyle}>
      <style>{`.task-list-item:hover { background-color: #f1f3f5; box-shadow: 0 4px 8px rgba(0,0,0,0.08); }`}</style>
      <div style={listPaneStyle}>
        <h3 style={listTitleStyle}>Tasks</h3>
        {tasks.length > 0 ? (
          tasks.map(task => {
            const isSelected = selectedTask?.id === task.id;
            const itemStyle: React.CSSProperties = {
              ...listItemStyleBase,
              borderLeftColor: getPriorityColor(task.priority),
              backgroundColor: isSelected ? '#ddeeff' : '#ffffff', // Light blue for selected
              ...(task.completed && listItemCompletedStyle)
            };
            return (
              <div
                key={task.id}
                className="task-list-item"
                style={itemStyle}
                onClick={() => handleTaskSelect(task)}
                title={task.title}
              >
                <div style={{...listItemTitleStyle, ...(task.completed && {textDecoration: 'line-through'})}}>{task.title}</div>
                {task.dueDate && (
                  <div style={{...listItemDateStyle, ...(task.completed && {textDecoration: 'line-through'})}}>
                    Due: {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
                {!task.dueDate && <div style={listItemDateStyle}>No due date</div>}
              </div>
            );
          })
        ) : (
          <p style={{textAlign: 'center', color: '#6c757d', marginTop: '30px'}}>No tasks in this view.</p>
        )}
      </div>
      <div style={detailPaneStyle}>
        {selectedTask ? (
          <>
            <h2 style={{...detailTitleStyle, borderLeft: `5px solid ${getPriorityColor(selectedTask.priority)}`, paddingLeft: '15px', ...(selectedTask.completed && listItemCompletedStyle)}}>
                {selectedTask.title}
            </h2>
            <p style={detailMetaStyle}>
              Priority: <span style={{fontWeight: 500, color: getPriorityColor(selectedTask.priority)}}>{selectedTask.priority.charAt(0).toUpperCase() + selectedTask.priority.slice(1)}</span>
              {selectedTask.dueDate && ` | Due: ${new Date(selectedTask.dueDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </p>
            <p style={{...detailMetaStyle, color: selectedTask.completed ? '#28a745' : '#dc3545' }}>
              Status: {selectedTask.completed ? 'Completed' : 'Active'}
            </p>
            {selectedTask.description && <p style={detailDescStyle}>{selectedTask.description}</p>}
            {!selectedTask.description && <p style={{...detailDescStyle, fontStyle: 'italic', color: '#6c757d'}}>No description provided.</p>}
            <p style={detailMetaStyle}>Created: {new Date(selectedTask.createdAt).toLocaleDateString()}</p>
          </>
        ) : (
          <div style={{display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#6c757d'}}>
            <p>Select a task to view details.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToDo;