import React from 'react';

interface ApiKeyState {
    apiKey: string;
    isLoading: boolean;
    error: string | null;
    isValid: boolean | null;
}

export const ByokwidgetApp: React.FC = () => {
    const [state, setState] = React.useState<ApiKeyState>({
        apiKey: '',
        isLoading: false,
        error: null,
        isValid: null,
    });

    // Load existing API key on mount
    React.useEffect(() => {
        loadApiKey();
    }, []);

    const loadApiKey = async () => {
        try {
            const result = await window.byokwidgetAPI.getApiKey();
            if (result.success && result.apiKey) {
                // Just check if we have a key that looks valid (format-wise)
                const looksValid = result.apiKey.length > 10 && result.apiKey.includes('...');
                setState((prev: ApiKeyState) => ({
                    ...prev,
                    apiKey: result.apiKey,
                    isValid: looksValid, // Green light if format looks reasonable
                }));
            }
        } catch (error) {
            console.error('Failed to load API key:', error);
        }
    };

    const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newKey = event.target.value;
        setState((prev: ApiKeyState) => ({
            ...prev,
            apiKey: newKey,
            error: null,
            isValid: null,
        }));
    };

    const handleSaveApiKey = async () => {
        if (!state.apiKey.trim()) {
            setState((prev: ApiKeyState) => ({ ...prev, error: 'API key cannot be empty' }));
            return;
        }

        setState((prev: ApiKeyState) => ({ ...prev, isLoading: true, error: null }));
        
        try {
            const result = await window.byokwidgetAPI.saveApiKey(state.apiKey.trim());
            if (result.success) {
                setState((prev: ApiKeyState) => ({
                    ...prev,
                    isLoading: false,
                    isValid: true, // Assume valid if save succeeded (passed format validation)
                }));
            } else {
                setState((prev: ApiKeyState) => ({
                    ...prev,
                    error: result.error || 'Failed to save API key',
                    isLoading: false,
                }));
            }
        } catch (error) {
            setState((prev: ApiKeyState) => ({
                ...prev,
                error: 'Failed to save API key',
                isLoading: false,
            }));
        }
    };

    const handleTestApiKey = async () => {
        if (!state.apiKey.trim()) {
            setState((prev: ApiKeyState) => ({ ...prev, error: 'API key cannot be empty' }));
            return;
        }

        setState((prev: ApiKeyState) => ({ ...prev, isLoading: true, error: null }));
        
        try {
            const result = await window.byokwidgetAPI.testApiKey(state.apiKey.trim());
            setState((prev: ApiKeyState) => ({
                ...prev,
                isLoading: false,
                isValid: result.success,
                error: result.success ? null : (result.error || 'API key test failed'),
            }));
        } catch (error) {
            setState((prev: ApiKeyState) => ({
                ...prev,
                error: 'Failed to test API key',
                isLoading: false,
                isValid: false,
            }));
        }
    };

    const getStatusClass = () => {
        if (state.isLoading) return 'loading';
        if (state.isValid === true) return 'valid';
        if (state.isValid === false) return 'invalid';
        return 'unknown';
    };

    return (
        <div className="byok-helper-app">
            <div className="byok-header">
                <div className="title-row">
                    <span className="byok-title">API Key</span>
                    <div className={`status-light ${getStatusClass()}`}></div>
                </div>
            </div>
            
            <div className="byok-content">
                <div className="api-key-input-group">
                    <input
                        type="password"
                        value={state.apiKey}
                        onChange={handleApiKeyChange}
                        placeholder="Enter your API key..."
                        className="api-key-input"
                        disabled={state.isLoading}
                    />
                    <button 
                        className="btn btn-primary" 
                        onClick={handleSaveApiKey}
                        disabled={state.isLoading || !state.apiKey.trim()}
                    >
                        {state.isLoading ? 'Saving...' : 'Save'}
                    </button>
                </div>
                
                {state.error && (
                    <div className="error-message">
                        {state.error}
                    </div>
                )}
            </div>
        </div>
    );
};