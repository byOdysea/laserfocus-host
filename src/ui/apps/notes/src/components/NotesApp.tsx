import React from 'react';

interface NotesAppState {
    isLoading: boolean;
    error: string | null;
    data: any;
}

export const NotesApp: React.FC = () => {
    const [state, setState] = React.useState<NotesAppState>({
        isLoading: false,
        error: null,
        data: null,
    });

    const handleExampleAction = async () => {
        setState((prev: NotesAppState) => ({ ...prev, isLoading: true, error: null }));
        
        try {
            const result = await window.notesAPI.exampleAction({ example: 'data' });
            if (result.success) {
                setState((prev: NotesAppState) => ({
                    ...prev,
                    data: result.result,
                    isLoading: false,
                }));
            } else {
                setState((prev: NotesAppState) => ({
                    ...prev,
                    error: result.error || 'Unknown error',
                    isLoading: false,
                }));
            }
        } catch (error) {
            setState((prev: NotesAppState) => ({
                ...prev,
                error: 'Failed to execute action',
                isLoading: false,
            }));
        }
    };

    return (
        <div className="notes-app">
            {/* Header */}
            <div className="notes-header">
                <h1 className="notes-title">Notes</h1>
                <button 
                    className="btn" 
                    onClick={handleExampleAction}
                    disabled={state.isLoading}
                >
                    {state.isLoading ? 'Loading...' : 'Example Action'}
                </button>
            </div>

            {/* Content */}
            <div className="notes-content">
                {state.error ? (
                    <div className="empty-state">Error: {state.error}</div>
                ) : state.data ? (
                    <div>
                        <h3>Result:</h3>
                        <pre>{JSON.stringify(state.data, null, 2)}</pre>
                    </div>
                ) : (
                    <div className="empty-state">
                        Welcome to Notes!<br />
                        Click "Example Action" to get started.
                    </div>
                )}
            </div>
        </div>
    );
};