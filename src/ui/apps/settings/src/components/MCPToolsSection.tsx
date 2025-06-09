import React from 'react';

interface MCPServer {
    name: string;
    enabled: boolean;
    connected?: boolean;
    agentCanUseTool?: boolean;
    toolCount?: number;
    error?: string;
}

interface MCPToolsSectionProps {
    config: any;
    onUpdate: (updates: any) => void;
}

const ServerRow: React.FC<{
    server: MCPServer;
    onToggle: (enabled: boolean) => void;
}> = ({ server, onToggle }: { server: MCPServer; onToggle: (enabled: boolean) => void }) => {
    const getStatusColor = () => {
        if (!server.enabled) return '#666'; // Disabled - gray
        if (server.error) return '#ef4444'; // Error - red (check error first!)
        if (server.agentCanUseTool) return '#10b981'; // Agent can use tools - green
        if (server.connected) return '#f59e0b'; // Connected but agent can't use tools - yellow
        return '#f59e0b'; // Other states - yellow
    };

    const getStatusTooltip = () => {
        if (!server.enabled) return 'Server disabled';
        if (server.error) return `Error: ${server.error}`;
        if (server.agentCanUseTool) return 'Agent can use tools from this server';
        if (server.connected) return 'Connected but agent cannot use tools yet';
        return 'Server status unknown';
    };

    const getStatusText = () => {
        if (!server.enabled) return 'Disabled';
        if (server.error) return 'Failed';
        if (server.agentCanUseTool) return 'Ready';
        if (server.connected) return 'Connected';
        return 'Unknown';
    };

    return (
        <div className="server-row-container">
            <div className="server-row">
                <div className="server-info">
                    <div 
                        className="status-dot" 
                        title={getStatusTooltip()}
                        style={{ backgroundColor: getStatusColor() }}
                    ></div>
                    <span className="server-name">{server.name}</span>
                    <span className="server-status">{getStatusText()}</span>
                    <span className="tool-count">{server.toolCount || 0} tools</span>
                </div>
                <div className="server-controls">
                    <label className="switch">
                        <input
                            type="checkbox"
                            checked={server.enabled}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onToggle(e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>
            </div>
            {server.error && server.enabled && (
                <div className="server-error">
                    <span className="error-message">⚠️ {server.error}</span>
                    {server.error.includes('not found') && (
                        <span className="error-hint">Install: <code>uvx mcp-server-brave-search</code></span>
                    )}
                </div>
            )}
        </div>
    );
};

const MCPToolsSection: React.FC<MCPToolsSectionProps> = ({ config, onUpdate }: MCPToolsSectionProps) => {
    const [servers, setServers] = React.useState<MCPServer[]>([]);
    const [showJsonEditor, setShowJsonEditor] = React.useState(false);
    const [jsonValue, setJsonValue] = React.useState('');
    const [jsonError, setJsonError] = React.useState('');

    // Load server status from the backend
    const loadServers = async () => {
        try {
            const statusResult = await (window as any).settingsAPI.getMCPStatus();
            
            if (statusResult.success) {
                const mcpConfig = config.integrations?.mcp || {};
                const { agentReady, connectionStatus, toolCounts } = statusResult.status;
                
                let serverList: MCPServer[] = [];
                
                if (Array.isArray(mcpConfig.servers)) {
                    // Array format: servers stored as array of objects
                    serverList = mcpConfig.servers.map((server: any) => {
                        const serverName = server.name;
                        const isEnabled = server.enabled !== false;
                        const connectionInfo = connectionStatus[serverName];
                        const isConnected = connectionInfo?.connected || false;
                        const toolCount = toolCounts[serverName] || 0;
                        const hasTools = toolCount > 0;
                        
                        return {
                            name: serverName,
                            enabled: isEnabled,
                            connected: isConnected,
                            agentCanUseTool: agentReady && isEnabled && hasTools,
                            toolCount,
                            error: connectionInfo?.error
                        };
                    });
                } else if (mcpConfig.servers && typeof mcpConfig.servers === 'object') {
                    // Object format: servers stored as key-value pairs
                    serverList = Object.entries(mcpConfig.servers).map(([id, serverConfig]: [string, any]) => {
                        const isEnabled = serverConfig.enabled !== false;
                        const connectionInfo = connectionStatus[id];
                        const isConnected = connectionInfo?.connected || false;
                        const toolCount = toolCounts[id] || 0;
                        const hasTools = toolCount > 0;
                        
                        return {
                            name: id,
                            enabled: isEnabled,
                            connected: isConnected,
                            agentCanUseTool: agentReady && isEnabled && hasTools,
                            toolCount,
                            error: connectionInfo?.error
                        };
                    });
                }
                
                setServers(serverList);
            }
        } catch (error) {
            console.error('[MCPTools] Error loading servers:', error);
        }
    };

    // Load servers when config changes
    React.useEffect(() => {
        loadServers();
    }, [config]);

    // Set up reliable polling for MCP status updates (proven to work well)
    React.useEffect(() => {
        const pollInterval = setInterval(() => {
            loadServers();
        }, 2000); // Poll every 2 seconds - reliable and not too aggressive
        
        return () => {
            clearInterval(pollInterval);
        };
    }, [config]); // Restart polling when config changes

    // Update JSON editor when config changes
    React.useEffect(() => {
        const mcpConfig = config.integrations?.mcp || {};
        setJsonValue(JSON.stringify(mcpConfig, null, 2));
        setJsonError('');
    }, [config]);

    const handleServerToggle = async (serverName: string, enabled: boolean) => {
        try {
            const mcpConfig = config.integrations?.mcp || {};
            let updatedServers;
            
            if (Array.isArray(mcpConfig.servers)) {
                // Array format: update the specific server in the array
                updatedServers = mcpConfig.servers.map((server: any) => 
                    server.name === serverName 
                        ? { ...server, enabled }
                        : server
                );
            } else {
                // Object format: convert to array format for schema compliance
                updatedServers = Object.entries(mcpConfig.servers || {}).map(([name, serverConfig]: [string, any]) => ({
                    name,
                    enabled: name === serverName ? enabled : (serverConfig.enabled !== false),
                    ...serverConfig
                }));
            }
            
            const updatedMCPConfig = {
                ...mcpConfig,
                servers: updatedServers
            };

            // Update through parent's onUpdate to integrate with main save flow
            onUpdate({
                integrations: {
                    ...config.integrations,
                    mcp: updatedMCPConfig
                }
            });

        } catch (error) {
            console.error('[MCPTools] Error toggling server:', error);
        }
    };

    const handleJsonChange = (value: string) => {
        setJsonValue(value);
        setJsonError('');
        
        try {
            const parsed = JSON.parse(value);
            // Update through parent's onUpdate to integrate with main save flow
            onUpdate({
                integrations: {
                    ...config.integrations,
                    mcp: parsed
                }
            });
        } catch (error) {
            setJsonError('Invalid JSON syntax');
        }
    };

    return (
        <div className="mcp-tools-section">
            <div className="mcp-header">
                <h4>MCP Servers</h4>
                <span className="server-count">{servers.length} server{servers.length !== 1 ? 's' : ''}</span>
            </div>
            
            <div className="server-list">
                {servers.map((server: MCPServer) => (
                    <ServerRow
                        key={server.name}
                        server={server}
                        onToggle={(enabled: boolean) => handleServerToggle(server.name, enabled)}
                    />
                ))}
            </div>

            <div className="json-editor-section">
                <div 
                    className="json-header"
                    onClick={() => setShowJsonEditor(!showJsonEditor)}
                    style={{ cursor: 'pointer' }}
                >
                    <span>MCP Configuration (JSON)</span>
                    <span className={`arrow ${showJsonEditor ? 'down' : 'right'}`}>▶</span>
                </div>
                
                {showJsonEditor && (
                    <div className="json-editor">
                        <textarea
                            value={jsonValue}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleJsonChange(e.target.value)}
                            style={{
                                width: '100%',
                                height: '300px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                color: '#e5e7eb',
                                border: 'none',
                                padding: '12px',
                                fontSize: '11px',
                                fontFamily: 'Monaco, Consolas, monospace',
                                resize: 'vertical',
                                outline: 'none'
                            }}
                            placeholder="MCP configuration JSON..."
                        />
                        {jsonError && (
                            <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>
                                {jsonError}
                            </div>
                        )}
                        <div style={{ 
                            fontSize: '12px', 
                            color: '#9ca3af', 
                            marginTop: '8px',
                            fontStyle: 'italic'
                        }}>
                            Changes will be applied when you click the main Save button above.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MCPToolsSection; 