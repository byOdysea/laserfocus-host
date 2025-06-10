import React from 'react';

interface SimpleByokState {
    // API Key
    apiKey: string;
    hasStoredApiKey: boolean;
    apiKeyChanged: boolean;
    
    // Provider/Model (read-only, for display)
    provider: string;
    model: string;
    
    // Status
    isValid: boolean | null;
    isLoading: boolean;
    error: string | null;
    saving: boolean;
    testing: boolean;
}

export const ByokwidgetApp: React.FC = () => {
    const [state, setState] = React.useState<SimpleByokState>({
        apiKey: '',
        hasStoredApiKey: false,
        apiKeyChanged: false,
        provider: '',
        model: '',
        isValid: null,
        isLoading: true,
        error: null,
        saving: false,
        testing: false,
    });

    // Load initial state
    React.useEffect(() => {
        loadInitialState();
    }, []);

    // Listen for configuration changes from other parts of the app
    React.useEffect(() => {
        const handleConfigChange = () => {
            console.log('[Byokwidget] Configuration change detected, reloading...');
            loadInitialState();
        };

        // ✅ KEEP: Event-driven config updates from ConfigurationManager
        window.addEventListener('config-updated', handleConfigChange);

        return () => {
            // ✅ KEEP: Event cleanup
            window.removeEventListener('config-updated', handleConfigChange);
        };
    }, []);

    // Check connection status periodically and when API key changes
    React.useEffect(() => {
        if (state.hasStoredApiKey) {
            // Check status after a brief delay to allow agent to process any changes
            const timeoutId = setTimeout(() => {
                checkConnectionStatus();
            }, 1000);
            
            return () => clearTimeout(timeoutId);
        }
    }, [state.hasStoredApiKey, state.apiKeyChanged]);

    const loadInitialState = async () => {
        try {
            console.log('[Byokwidget] Loading initial state...');
            console.log('[Byokwidget] Environment:', process.env.NODE_ENV);
            
            // Skip force config refresh - causes redundant loading on first request
            // Configuration changes are handled automatically by ConfigurableComponent
            // if (process.env.NODE_ENV === 'production') {
            //     console.log('[Byokwidget] Production mode: forcing config refresh...');
            //     await window.byokwidgetAPI.forceConfigRefresh();
            // }
            
            const [configResult, apiKeyResult] = await Promise.all([
                window.byokwidgetAPI.getConfig(),
                window.byokwidgetAPI.getApiKey()
            ]);

            console.log('[Byokwidget] Config result:', configResult);
            console.log('[Byokwidget] API key result:', apiKeyResult);

            let provider = '';
            let model = '';
            let hasStoredApiKey = false;
            let apiKey = '';

            if (configResult.success && configResult.config) {
                provider = configResult.config.provider || '';
                model = configResult.config.model || '';
                console.log('[Byokwidget] Updated provider:', provider, 'model:', model);
                console.log('[Byokwidget] Full config object:', JSON.stringify(configResult.config, null, 2));
            } else {
                console.error('[Byokwidget] Failed to load configuration:', configResult);
                setState((prev: SimpleByokState) => ({
                    ...prev,
                    error: 'Failed to load configuration',
                    isLoading: false,
                }));
                return;
            }

            // Only show stored API key in input if it's actually being used by the configuration
            if (apiKeyResult.success && configResult.config?.hasApiKey) {
                hasStoredApiKey = apiKeyResult.hasApiKey || false;
                apiKey = apiKeyResult.apiKey || '';
            } else {
                // Configuration has no API key, so show empty input regardless of BYOK storage
                hasStoredApiKey = false;
                apiKey = '';
                console.log('[Byokwidget] Configuration has no API key - showing empty input');
            }

            console.log('[Byokwidget] Setting state with provider:', provider, 'model:', model);
            console.log('[Byokwidget] Previous state provider/model:', state.provider, state.model);
            
            setState((prev: SimpleByokState) => ({
                ...prev,
                provider,
                model,
                hasStoredApiKey,
                apiKey,
                isLoading: false,
            }));

            // Always check connection status to get accurate state
            checkConnectionStatus();
        } catch (error) {
            console.error('[Byokwidget] Error loading initial state:', error);
            setState((prev: SimpleByokState) => ({
                ...prev,
                error: 'Failed to load configuration',
                isLoading: false,
            }));
        }
    };

    const checkConnectionStatus = async () => {
        setState((prev: SimpleByokState) => ({ ...prev, testing: true }));

        try {
            // Get the actual connection status from the agent
            const result = await window.byokwidgetAPI.getStatus();
            console.log('[Byokwidget] Status check result:', result);
            
            if (result.success && result.status) {
                const { connectionStatus, provider, model } = result.status;
                console.log('[Byokwidget] Connection status from agent:', connectionStatus);
                console.log('[Byokwidget] Provider/model from status:', provider, model);
                
                // Map connection status to UI state
                let isValid: boolean | null = null;
                if (connectionStatus === 'connected' || connectionStatus === 'local') {
                    isValid = true; // Green - working
                } else if (connectionStatus === 'configured') {
                    isValid = null; // Yellow - configured but not tested yet
                } else if (connectionStatus === 'failed') {
                    isValid = false; // Red - failed
                } else if (connectionStatus === 'no-key') {
                    isValid = false; // Red - no key
                }
                
                console.log('[Byokwidget] Mapped isValid to:', isValid);
                setState((prev: SimpleByokState) => ({
                    ...prev,
                    provider: provider || prev.provider,  // Update provider from status
                    model: model || prev.model,          // Update model from status
                    isValid,
                    testing: false,
                }));
            } else {
                console.log('[Byokwidget] Status check failed or no status:', result);
            setState((prev: SimpleByokState) => ({
                ...prev,
                    isValid: false,
                testing: false,
            }));
            }
        } catch (error) {
            console.error('[Byokwidget] Error checking connection status:', error);
            setState((prev: SimpleByokState) => ({
                ...prev,
                isValid: false,
                testing: false,
            }));
        }
    };

    const handleApiKeyChange = (value: string) => {
        setState((prev: SimpleByokState) => ({
            ...prev,
            apiKey: value,
            apiKeyChanged: true,
            error: null,
            isValid: null, // Reset validation status
        }));
    };

    const handleSaveApiKey = async () => {
        if (!state.apiKey.trim()) {
            setState((prev: SimpleByokState) => ({ ...prev, error: 'Please enter an API key' }));
            return;
        }

        setState((prev: SimpleByokState) => ({ ...prev, saving: true, error: null }));

        try {
            const result = await window.byokwidgetAPI.saveApiKey(state.apiKey.trim());
            
            if (result.success) {
                setState((prev: SimpleByokState) => ({
                    ...prev,
                    hasStoredApiKey: true,
                    apiKeyChanged: false,
                    saving: false,
                }));
                
                // Check connection status after saving
                setTimeout(() => checkConnectionStatus(), 500);
            } else {
                setState((prev: SimpleByokState) => ({
                    ...prev,
                    error: result.error || 'Failed to save API key',
                    saving: false,
                }));
            }
        } catch (error) {
            setState((prev: SimpleByokState) => ({
                ...prev,
                error: 'Failed to save API key',
                saving: false,
            }));
        }
    };

    const openSettings = () => {
        // This will be handled by the main process to open the Settings app
        window.byokwidgetAPI.openSettings?.();
    };

    const getStatusClass = () => {
        if (state.testing) return 'testing';
        if (state.isValid === true) return 'connected';  // Green
        if (state.isValid === false) return 'error';     // Red
        if (state.isValid === null) return 'configured'; // Yellow
        return 'unknown';
    };

    const getStatusText = () => {
        if (state.testing) return 'testing';
        if (state.isValid === true) return 'connected';
        if (state.isValid === false) return 'error';
        if (state.isValid === null) return 'configured';
        return 'unknown';
    };

    const getProviderDisplayName = (provider: string) => {
        // Use the actual configured values instead of hardcoded ones
        return state.model ? `${provider}/${state.model}` : provider || 'loading...';
    };

    if (state.isLoading) {
        return (
            <div className="byok-widget loading">
                <div className="loading-text">Loading...</div>
            </div>
        );
    }

    return (
        <div className="byok-widget">
            {/* Provider Header */}
            <div className="provider-header">
                <div className="provider-title">
                    <div className="provider-name">{getProviderDisplayName(state.provider)}</div>
                    <div className="status-indicator">
                        <div className={`status-dot ${getStatusClass()}`} />
                    </div>
                </div>
                <div className="status-text">{getStatusText()}</div>
            </div>

            {/* API Key Section */}
            <div className="api-key-section">
                <div className="api-key-label">API Key</div>
                <div className="input-wrapper">
                    <input
                        type="password"
                        value={state.apiKey}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleApiKeyChange(e.target.value)}
                        placeholder={state.hasStoredApiKey ? '••••••••••••••••' : 'paste your api key...'}
                        className="api-key-input"
                    />
                    <button
                        onClick={handleSaveApiKey}
                        disabled={!state.apiKeyChanged || state.saving || !state.apiKey.trim()}
                        className="save-button"
                    >
                        {state.saving ? '...' : 'save'}
                    </button>
                </div>
                
                {/* Always render error container to reserve space */}
                <div className="error-message" data-empty={!state.error}>
                    {state.error || ''}
                </div>
                
                {/* Always render help text container to reserve space */}
                <div className="help-text" data-empty={!(state.provider === 'google' && !state.hasStoredApiKey)}>
                    {state.provider === 'google' && !state.hasStoredApiKey ? (
                        <>
                            get a free api key from{' '}
                            <a 
                                href="https://makersuite.google.com/app/apikey" 
                                target="_blank" 
                                rel="noopener noreferrer"
                            >
                                google ai studio
                            </a>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};