import React from 'react';

// Define local interfaces to resolve 'any' types within this component
interface MCPServer {
    name: string;
    enabled: boolean;
    connected?: boolean;
    agentCanUseTool?: boolean;
    toolCount?: number;
    error?: string;
}

interface MCPConfig {
    enabled: boolean;
    servers: MCPServer[];
}

interface MCPToolsSectionProps {
    config: {
        integrations?: {
            mcp?: MCPConfig;
        };
    } | null;
    onUpdate: (updates: any) => void;
}

const ServerRow: React.FC<{
    server: MCPServer;
    onToggle: () => void;
}> = ({ server, onToggle }: { server: MCPServer; onToggle: () => void }) => {
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
                            onChange={onToggle} // Directly use the passed-in handler
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
    const [serverStatuses, setServerStatuses] = React.useState<Map<string, Partial<MCPServer>>>(new Map());
    const [showJsonEditor, setShowJsonEditor] = React.useState(false);
    const [jsonValue, setJsonValue] = React.useState('');
    const [jsonError, setJsonError] = React.useState('');

    // Poll for live server statuses (connected, tool count, etc.)
    React.useEffect(() => {
        const pollStatuses = async () => {
            try {
                const result = await window.settingsAPI.getMCPStatus();
                if (result.success && result.status) {
                    const { connectionStatus, toolCounts, agentReady } = result.status;
                    setServerStatuses((prevStatuses: Map<string, Partial<MCPServer>>) => {
                        const newStatuses = new Map(prevStatuses);
                        Object.keys(connectionStatus).forEach(serverName => {
                            const isEnabledInConfig = (config?.integrations?.mcp?.servers || []).find(
                                (s: MCPServer) => s.name === serverName
                            )?.enabled !== false;
                            const hasTools = (toolCounts[serverName] || 0) > 0;
                            newStatuses.set(serverName, {
                                connected: connectionStatus[serverName]?.connected,
                                error: connectionStatus[serverName]?.error,
                                toolCount: toolCounts[serverName] || 0,
                                agentCanUseTool: agentReady && isEnabledInConfig && hasTools
                            });
                        });
                        return newStatuses;
                    });
                }
            } catch (error) {
                console.error('Failed to poll MCP statuses:', error);
            }
        };

        pollStatuses(); // Initial poll
        const intervalId = setInterval(pollStatuses, 2500); // Poll every 2.5 seconds

        return () => clearInterval(intervalId);
    }, [config]); // Re-run if config changes to update agentCanUseTool status

    // Update JSON editor when config prop changes
    React.useEffect(() => {
        const mcpConfig = config?.integrations?.mcp || {};
        setJsonValue(JSON.stringify(mcpConfig, null, 2));
        setJsonError('');
    }, [config]);

    const handleServerToggle = (serverName: string) => {
        const mcpConfig = config?.integrations?.mcp || { enabled: false, servers: [] };
        const updatedServers = (mcpConfig.servers || []).map((server: MCPServer) =>
            server.name === serverName
                ? { ...server, enabled: !server.enabled } // Simple toggle
                : server
        );

        onUpdate({
            integrations: {
                ...config?.integrations,
                mcp: {
                    ...mcpConfig,
                    servers: updatedServers,
                },
            },
        });
    };

    const handleJsonChange = (value: string) => {
        setJsonValue(value);
        try {
            const parsed = JSON.parse(value);
            onUpdate({ integrations: { ...config?.integrations, mcp: parsed } });
            setJsonError('');
        } catch (e: any) {
            setJsonError('Invalid JSON syntax');
        }
    };

    // Derive the servers to render directly from props and polled status state
    const serversToRender = (config?.integrations?.mcp?.servers || []).map((server: MCPServer) => ({
        ...server, // Data from config (name, enabled)
        ...(serverStatuses.get(server.name) || {}), // Live data from polling (connected, toolCount, error)
    }));

    return (
        <div className="mcp-tools-section">
            <div className="mcp-header">
                <h4>MCP Servers</h4>
                <span className="server-count">{serversToRender.length} server{serversToRender.length !== 1 ? 's' : ''}</span>
            </div>
            
            <div className="server-list">
                {serversToRender.map((server: MCPServer) => (
                    <ServerRow
                        key={server.name}
                        server={server}
                        onToggle={() => handleServerToggle(server.name)}
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