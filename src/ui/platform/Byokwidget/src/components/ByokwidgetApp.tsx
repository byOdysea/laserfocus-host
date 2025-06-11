import React from 'react';

interface SimpleByokState {
    // API Key
    apiKey: string; // Current value in input
    hasStoredApiKey: boolean; // For placeholder logic
    apiKeyChanged: boolean; // Tracks if input differs from stored
    
    // Provider/Model (read-only, for display)
    provider: string;
    model: string;
    
    // Status - derived from AgentStatusInfo
    isValid: boolean; // true: agent ready (green), false: not ready (red)
    isLoading: boolean; // For initial load
    statusText: string; // Descriptive status message
    
    // UI interaction states
    saving: boolean; // True during API key save operation
    testing: boolean; // True during the brief API key save/test period (legacy, kept for now)
}

export const ByokwidgetApp: React.FC = () => {
    const [state, setState] = React.useState<SimpleByokState>({
        apiKey: '',
        hasStoredApiKey: false,
        apiKeyChanged: false,
        provider: '',
        model: '',
        isValid: false, // Default to not valid
        isLoading: true,
        statusText: 'Initializing...', // Initial status text
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

    // The checkConnectionStatus is now called by loadInitialState and handleSaveApiKey directly.

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
                    statusText: 'Failed to load configuration',
                    isValid: false,
                    isLoading: false,
                }));
                // No early return, fall through to checkConnectionStatus
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
                apiKey,
                hasStoredApiKey,
                apiKeyChanged: false, // Reset changed flag
                isLoading: false, // Done with initial load
                // Status will be updated by checkConnectionStatus
            }));

            // Always refresh connection status after loading initial state and setting provider/model
            await checkConnectionStatus();

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
        console.log('[Byokwidget] Checking agent provider status...');
        setState((prev: SimpleByokState) => ({ ...prev, statusText: 'Checking...' }));

        try {
            const agentStatus = await window.byokwidgetAPI.getAgentProviderStatus();
            console.log('[Byokwidget] Agent provider status result:', agentStatus);

            let currentStatusText = '';
            const isValidConnection = agentStatus.ready;

            if (isValidConnection) {
                currentStatusText = 'Connected';
            } else {
                if (agentStatus.lastError) {
                    currentStatusText = agentStatus.lastError;
                } else if (agentStatus.connectionStatus === 'no-key') {
                    currentStatusText = 'API Key Missing';
                } else if (agentStatus.connectionStatus === 'disabled') {
                    currentStatusText = 'Provider Disabled';
                } else if (!agentStatus.hasValidConfig) {
                    currentStatusText = 'Invalid Configuration';
                } else if (agentStatus.connectionStatus === 'configured') {
                    currentStatusText = 'Configured (Review Needed)';
                } else if (agentStatus.connectionStatus === 'error') {
                    currentStatusText = 'Connection Error';
                } else if (agentStatus.connectionStatus === 'failed') {
                    currentStatusText = 'Connection Failed';
                } else if (agentStatus.connectionStatus === 'disconnected') {
                    currentStatusText = 'Disconnected';
                } else {
                    currentStatusText = 'Needs Configuration';
                }
            }

            setState((prev: SimpleByokState) => ({
                ...prev,
                isValid: isValidConnection,
                statusText: currentStatusText,
                provider: agentStatus.provider,
                model: agentStatus.model,
            }));

        } catch (error) {
            console.error('[Byokwidget] Error checking agent provider status:', error);
            setState((prev: SimpleByokState) => ({
                ...prev,
                isValid: false,
                statusText: 'Failed to get agent status',
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
        setState((prev: SimpleByokState) => ({
            ...prev,
            saving: true,
            testing: true, // Keep testing true for the spinner during save
            statusText: 'Saving API Key...', // Clear previous error/status
        }));

        try {
            const result = await window.byokwidgetAPI.saveApiKey(state.apiKey.trim());
            
            if (result.success) {
                setState((prev: SimpleByokState) => ({
                    ...prev,
                    apiKey: state.apiKey, // Use the successfully saved key from current state
                    hasStoredApiKey: true,
                    apiKeyChanged: false,
                    statusText: 'API Key Saved.', // Updated status
                    saving: false,
                    testing: false, // Done testing
                }));
                // Check status immediately after successful save
                await checkConnectionStatus();
            } else {
                setState((prev: SimpleByokState) => ({
                    ...prev,
                    statusText: result.error || 'Failed to save API key',
                    isValid: false, // Saving failed, likely not valid
                    saving: false,
                    testing: false,
                }));
            }
        } catch (error) {
            console.error('[Byokwidget] Error saving API key:', error);
            setState((prev: SimpleByokState) => ({
                ...prev,
                statusText: 'Failed to save API key',
                isValid: false, // Saving failed, likely not valid
                saving: false,
                testing: false,
            }));
        }
    };

    const getStatusClass = () => {
        if (state.testing) return 'testing'; // For the brief save operation
        if (state.isValid) return 'connected';  // Green
        return 'error';     // Red for all other non-valid states
    };

    const getStatusText = () => {
        if (state.testing) return 'Saving...'; // Or 'Testing...' if that's preferred for the save op
        return state.statusText;
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
            <div className="provider-header">
                <div className="provider-title">
                    <div className="provider-name">{getProviderDisplayName(state.provider)}</div>
                    <div className="status-indicator">
                        <div className={`status-dot ${getStatusClass()}`} />
                    </div>
                </div>
                {/* This specific status text in the header might be redundant now, 
                    or could display a simplified version. For now, let's hide it if detailed one is below input.
                    Alternatively, it could show the `state.provider` / `state.model` or a simpler status.
                    Let's keep it for now but it will show the full statusText. */}
                <div className={`status-text ${getStatusClass()}`}>{getStatusText()}</div>
            </div>

            <div className="byok-content">
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