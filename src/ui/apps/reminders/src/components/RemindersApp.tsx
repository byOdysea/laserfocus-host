import React, { useState, useEffect } from 'react';

interface RemindersAppState {
    isLoading: boolean;
    error: string | null;
    data: any;
}

export const RemindersApp: React.FC = () => {
    const [state, setState] = useState<RemindersAppState>({
        isLoading: false,
        error: null,
        data: null,
    });

    const handleExampleAction = async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        
        try {
            const result = await window.remindersAPI.exampleAction({ example: 'data' });
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    data: result.result,
                    isLoading: false,
                }));
            } else {
                setState(prev => ({
                    ...prev,
                    error: result.error || 'Unknown error',
                    isLoading: false,
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: 'Failed to execute action',
                isLoading: false,
            }));
        }
    };

    return (
        <div className="reminders-app">
            {/* Header */}
            <div className="reminders-header">
                <h1 className="reminders-title">Reminders</h1>
                <button 
                    className="btn" 
                    onClick={handleExampleAction}
                    disabled={state.isLoading}
                >
                    {state.isLoading ? 'Loading...' : 'Example Action'}
                </button>
            </div>

            {/* Content */}
            <div className="reminders-content">
                {state.error ? (
                    <div className="empty-state">Error: {state.error}</div>
                ) : state.data ? (
                    <div>
                        <h3>Result:</h3>
                        <pre>{JSON.stringify(state.data, null, 2)}</pre>
                    </div>
                ) : (
                    <div className="empty-state">
                        Welcome to Reminders!<br />
                        Click "Example Action" to get started.
                    </div>
                )}
            </div>
        </div>
    );
};