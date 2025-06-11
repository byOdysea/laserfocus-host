import React from 'react';
import MCPToolsSection from './MCPToolsSection';

interface ConfigValue {
    type: 'string' | 'number' | 'boolean' | 'enum' | 'select' | 'json';
    label: string;
    default?: any;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    sensitive?: boolean;
    optional?: boolean;
    dependsOn?: string;
}

interface ConfigSchema {
    [section: string]: {
        [key: string]: ConfigValue;
    };
}

interface SettingsAppState {
    isLoading: boolean;
    error: string | null;
    config: any;
    schema: ConfigSchema | null;
    saving: boolean;
}

interface SettingItemProps {
    sectionName: string;
    fieldName: string;
    fieldSchema: ConfigValue;
    value: any;
    onChange: (section: string, field: string, value: any) => void;
    workingConfig?: any;
}

const SettingItem: React.FC<SettingItemProps> = (props: SettingItemProps) => {
    const { sectionName, fieldName, fieldSchema, value, onChange, workingConfig } = props;
    const [selectOptions, setSelectOptions] = React.useState<Array<{value: string; label: string}>>([]);
    const [loadingOptions, setLoadingOptions] = React.useState(false);

    const handleChange = (newValue: any) => {
        onChange(sectionName, fieldName, newValue);
    };

    // Load select options when field depends on another field
    React.useEffect(() => {
        if (fieldSchema.type === 'select' && fieldSchema.dependsOn) {
            const dependentValue = workingConfig?.[sectionName]?.[fieldSchema.dependsOn];
            if (dependentValue) {
                loadSelectOptions(dependentValue);
            }
        }
    }, [fieldSchema, sectionName, fieldSchema.dependsOn && workingConfig?.[sectionName]?.[fieldSchema.dependsOn]]);

    const loadSelectOptions = async (dependentValue: string) => {
        if (fieldName === 'model' && sectionName === 'provider') {
            console.log(`[Settings] Loading model options for provider: ${dependentValue}`);
            setLoadingOptions(true);
            try {
                const result = await (window as any).settingsAPI.getModels(dependentValue);
                console.log(`[Settings] Model options result:`, result);
                if (result.success && result.models) {
                    console.log(`[Settings] Setting ${result.models.length} model options:`, result.models);
                    setSelectOptions(result.models);
                } else {
                    console.log(`[Settings] No models returned or request failed`);
                    setSelectOptions([]);
                }
            } catch (error) {
                console.error('Failed to load model options:', error);
                setSelectOptions([]);
            } finally {
                setLoadingOptions(false);
            }
        }
    };

    const renderInput = () => {
        switch (fieldSchema.type) {
            case 'boolean':
                return (
                    <div className="setting-item">
                        <label className="setting-checkbox">
                            <input
                                type="checkbox"
                                checked={value || false}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.checked)}
                            />
                            <span className="setting-checkbox-label">{fieldSchema.label}</span>
                        </label>
                    </div>
                );

            case 'enum':
                return (
                    <div className="setting-item">
                        <label className="setting-label">{fieldSchema.label}</label>
                        <select
                            value={value || fieldSchema.default}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange(e.target.value)}
                            className="setting-select"
                        >
                            {fieldSchema.options?.map((option: string) => (
                                <option key={option} value={option}>
                                    {option.charAt(0).toUpperCase() + option.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>
                );

            case 'select':
                return (
                    <div className="setting-item">
                        <label className="setting-label">{fieldSchema.label}</label>
                        <select
                            value={value || fieldSchema.default}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange(e.target.value)}
                            className="setting-select"
                            disabled={loadingOptions}
                        >
                            {loadingOptions ? (
                                <option value="">Loading...</option>
                            ) : selectOptions.length > 0 ? (
                                selectOptions.map((option: {value: string; label: string}) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))
                            ) : (
                                <option value="">No options available</option>
                            )}
                        </select>
                    </div>
                );

            case 'number':
                return (
                    <div className="setting-item">
                        <label className="setting-label">{fieldSchema.label}</label>
                        <input
                            type="number"
                            value={value ?? fieldSchema.default ?? ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(parseFloat(e.target.value) || 0)}
                            min={fieldSchema.min}
                            max={fieldSchema.max}
                            step={fieldSchema.step || 1}
                            className="setting-input"
                        />
                    </div>
                );

            case 'json':
                return (
                    <div className="setting-item">
                        <label className="setting-label">{fieldSchema.label}</label>
                        <textarea
                            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value ?? '{}'}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    handleChange(parsed);
                                } catch (error) {
                                    // Allow invalid JSON during editing
                                    handleChange(e.target.value);
                                }
                            }}
                            className="setting-textarea"
                            rows={10}
                            placeholder="Enter JSON configuration..."
                        />
                        <small className="setting-help">
                            Edit the JSON configuration directly. Changes are saved automatically when valid JSON is entered.
                        </small>
                    </div>
                );

            default: // string
                return (
                    <div className="setting-item">
                        <label className="setting-label">{fieldSchema.label}</label>
                        <input
                            type={fieldSchema.sensitive ? 'password' : 'text'}
                            value={value ?? fieldSchema.default ?? ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange(e.target.value)}
                            className="setting-input"
                            placeholder={fieldSchema.optional ? 'Optional' : ''}
                        />
                    </div>
                );
        }
    };

    return renderInput();
};

export const SettingsApp: React.FC = () => {
    console.info('Component rendering...');
    
    const [state, setState] = React.useState<SettingsAppState>({
        isLoading: true,
        error: null,
        config: null,
        schema: null,
        saving: false,
    });

    const [workingConfig, setWorkingConfig] = React.useState<any>(null);
    const [modelOptions, setModelOptions] = React.useState<string[]>([]);

    // Load initial data
    React.useEffect(() => {
        console.info('useEffect triggered, loading settings...');
        
        const loadSettings = async () => {
            try {
                console.info('Checking settingsAPI availability...');
                if (!(window as any).settingsAPI) {
                    console.error('[SettingsApp] settingsAPI is not available on window');
                    setState((prev: SettingsAppState) => ({
                        ...prev,
                        isLoading: false,
                        error: 'Settings API not available'
                    }));
                    return;
                }

                console.info('settingsAPI available, making calls...');
                const [configResult, schemaResult] = await Promise.all([
                    (window as any).settingsAPI.getConfig(),
                    (window as any).settingsAPI.getSchema()
                ]);

                console.debug('API calls completed:', { configResult, schemaResult });
                console.debug('Loaded config:', configResult);
                console.debug('Loaded schema:', schemaResult);

                setState((prev: SettingsAppState) => ({
                    ...prev,
                    isLoading: false,
                    config: configResult.success ? configResult.config : configResult,
                    schema: schemaResult.success ? schemaResult.schema : schemaResult
                }));

                setWorkingConfig(configResult.success ? configResult.config : configResult);

                // Load model options for current provider
                const currentProvider = configResult.config?.provider?.service;
                if (currentProvider) {
                    await loadModelOptions(currentProvider);
                }

            } catch (error) {
                console.error('Failed to load settings:', error);
                setState((prev: SettingsAppState) => ({
                    ...prev,
                    isLoading: false,
                    error: 'Failed to load settings'
                }));
            }
        };

        loadSettings();
    }, []);

    const handleFieldChange = (section: string, field: string, value: any) => {
        setWorkingConfig((prev: any) => {
            const updated = {
                ...prev,
                [section]: {
                    ...prev[section],
                    [field]: value,
                },
            };

            // Auto-update dependent fields when provider changes
            if (section === 'provider' && field === 'service') {
                console.info(`Provider changed to: ${value}, resetting model to default`);
                
                // Map providers to their default models
                const defaultModels = {
                    google: 'gemini-1.5-flash-latest',
                    openai: 'gpt-4o',
                    anthropic: 'claude-3-5-sonnet-20241022',
                    ollama: 'llama3.2',
                    custom: 'default'
                };
                
                const defaultModel = defaultModels[value as keyof typeof defaultModels];
                if (defaultModel) {
                    updated.provider.model = defaultModel;
                    console.info(`Auto-selected default model for ${value}: ${defaultModel}`);
                }
            }

            return updated;
        });
    };

    const handleSave = async () => {
        console.info('Save button clicked');
        setState((prev: SettingsAppState) => ({ ...prev, saving: true }));
        
        try {
            const result = await (window as any).settingsAPI.updateConfig(workingConfig);
            console.debug('Save result:', result);
            
            if (result.success) {
                setState((prev: SettingsAppState) => ({ 
                    ...prev, 
                    config: result.config,
                    saving: false 
                }));
                setWorkingConfig(result.config);
                console.info('Configuration saved successfully');
                
                // Simple timeout approach for MCP status refresh (works reliably)
                setTimeout(async () => {
                    try {
                        const mcpStatus = await (window as any).settingsAPI.getMCPStatus();
                        console.info('Refreshed MCP status after save:', mcpStatus);
                        // Force re-render to update status
                        setState((prev: SettingsAppState) => ({ ...prev, config: { ...prev.config } }));
                    } catch (error) {
                        console.warn('[Settings] Failed to refresh MCP status:', error);
                    }
                }, 1000); // 1 second should be enough for most connections
            } else {
                console.error('[Settings] Save failed:', result.error);
            }
        } catch (error) {
            console.error('[Settings] Save error:', error);
            setState((prev: SettingsAppState) => ({ ...prev, saving: false }));
        }
    };

    const handleReset = () => {
        setWorkingConfig(state.config);
        setState((prev: SettingsAppState) => ({ ...prev, error: null }));
    };

    const handleOpenApiKeys = (e: React.MouseEvent<HTMLButtonElement>) => {
        // Open BYOK widget for API key management
        (window as any).settingsAPI.openByokWidget();
        
        // Visual feedback
        const button = e.currentTarget;
        const originalText = button.textContent;
        button.textContent = '✓ Opening...';
        button.style.opacity = '0.7';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.opacity = '1';
        }, 800);
    };

    const hasChanges = JSON.stringify(workingConfig) !== JSON.stringify(state.config);

    // Define the section order and titles with our new semantic categories
    const getSectionGroups = (schema: ConfigSchema) => {
        const sectionConfig = [
            { key: 'provider', title: 'Provider' },
            { key: 'system', title: 'System' },
            { key: 'ui', title: 'Interface' },
            { key: 'workspace', title: 'Workspace' },
            { key: 'integrations', title: 'Integrations' },
            { key: 'performance', title: 'Performance' },
            { key: 'security', title: 'Security' }
        ];
        
        const groups: any[] = [];
        
        // Helper function to check if a section has any actual fields
        const hasFields = (sectionSchema: any) => {
            return sectionSchema && Object.keys(sectionSchema).length > 0;
        };
        
        // Add sections in the specified order, but only if they have fields
        sectionConfig.forEach(({ key, title }) => {
            if (schema[key] && (hasFields(schema[key]) || key === 'integrations')) {
                groups.push({
                    key,
                    title,
                    schema: schema[key]
                });
            }
        });
        
        // Add any remaining sections that weren't in our predefined order, but only if they have fields
        Object.entries(schema).forEach(([sectionName, sectionSchema]) => {
            if (!sectionConfig.some(config => config.key === sectionName) && hasFields(sectionSchema)) {
                groups.push({
                    key: sectionName,
                    title: sectionName.charAt(0).toUpperCase() + sectionName.slice(1),
                    schema: sectionSchema
                });
            }
        });
        
        return groups;
    };

    const loadModelOptions = async (dependentValue: string) => {
        try {
            console.info(`Loading model options for provider: ${dependentValue}`);
            const result = await (window as any).settingsAPI.getModelOptions(dependentValue);
            
            if (result.success && result.models) {
                console.debug(`Model options result:`, result);
                console.info(`Setting ${result.models.length} model options:`, result.models);
                setModelOptions(result.models);
            } else {
                console.warn(`No models returned or request failed`);
                setModelOptions([]);
            }
        } catch (error) {
            console.error('Failed to load model options:', error);
            setModelOptions([]);
        }
    };

    if (state.isLoading) {
        return (
            <div className="settings-app loading">
                <div className="loading-spinner">Loading settings...</div>
            </div>
        );
    }

    if (state.error) {
        return (
            <div className="settings-app error">
                <div className="error-message">
                    <h3>Error</h3>
                    <p>{state.error}</p>
                </div>
            </div>
        );
    }

    const sectionGroups = state.schema ? getSectionGroups(state.schema) : [];

    return (
        <div className="settings-app">
            <div className="settings-header">
                <h1 className="settings-title">Laserfocus Settings</h1>
                <div className="header-actions">
                    {hasChanges && (
                        <>
                            <button 
                                className="btn btn-secondary" 
                                onClick={handleReset}
                                disabled={state.saving}
                            >
                                Reset
                            </button>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleSave}
                                disabled={state.saving}
                            >
                                {state.saving ? 'Saving...' : 'Save'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="settings-content">
                <div className="settings-list">
                    {sectionGroups.map(({ key, title, schema }) => (
                        <div key={key} className="settings-group">
                            <div className="group-title">
                                {title}
                                {key === 'provider' && (
                                    <div className="group-actions">
                                        <button 
                                            className="btn-icon"
                                            onClick={handleOpenApiKeys}
                                            title="Open BYOK Widget to manage API keys"
                                        >
                                            🔑 Open BYOK
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            {key === 'integrations' ? (
                                <MCPToolsSection 
                                    config={workingConfig} 
                                    onUpdate={(updates: any) => setWorkingConfig(updates)}
                                />
                            ) : (
                                <div className="settings-items">
                                    {Object.entries(schema).map(([fieldName, fieldSchema]) => (
                                        <SettingItem
                                            key={fieldName}
                                            sectionName={key}
                                            fieldName={fieldName}
                                            fieldSchema={fieldSchema as ConfigValue}
                                            value={workingConfig?.[key]?.[fieldName]}
                                            onChange={handleFieldChange}
                                            workingConfig={workingConfig}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};