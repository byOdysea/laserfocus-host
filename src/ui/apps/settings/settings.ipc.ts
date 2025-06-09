import { generateUISchema } from '@/core/infrastructure/config/schema-utils';
import { PROVIDER_MODELS, getProviderModelsWithDefaults } from '@core/infrastructure/config/config';
import { ConfigurationManager } from '@core/infrastructure/config/configuration-manager';
import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import { SettingsWindow } from '@ui/apps/settings/settings.main';
import * as logger from '@utils/logger';
import { IpcMain } from 'electron';

const SettingsIpcHandlers: AppIpcModule = {
    moduleId: 'Settings',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: SettingsWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[settingsIPC] Registering settings IPC handlers');

        // Get current configuration
        ipcMain.handle('settings:get-config', async () => {
            try {
                const configManager = ConfigurationManager.getInstance();
                const config = configManager.get();
                
                return { 
                    success: true, 
                    config
                };
            } catch (error) {
                logger.error('[settingsIPC] Error getting config:', error);
                return { success: false, error: 'Failed to get configuration' };
            }
        });

        // Register update configuration handler
        ipcMain.handle('settings:update-config', async (event, configUpdates: any) => {
            try {
                logger.info(`[settingsIPC] Updating configuration:`, configUpdates);
                
                const configManager = ConfigurationManager.getInstance();
                const result = await configManager.update(configUpdates);
                logger.info(`[settingsIPC] Configuration updated successfully`);
                
                // Note: Agent now handles its own tool refresh via persistent MCP event listeners
                // No need for external coordination - agent will automatically refresh when MCP servers connect
                
                return { success: true, config: configManager.get() };
            } catch (error) {
                logger.error(`[settingsIPC] Failed to update configuration:`, error);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });

        // Get configuration schema for dynamic UI generation
        ipcMain.handle('settings:get-schema', async () => {
            try {
                // Use the centralized schema generator - single source of truth!
                const schema = generateUISchema();
                return { success: true, schema };
            } catch (error) {
                logger.error('[settingsIPC] Error getting schema:', error);
                return { success: false, error: 'Failed to get schema' };
            }
        });

        // Get available models for a provider
        ipcMain.handle('settings:get-models', async (event, provider: string) => {
            try {
                logger.info(`[settingsIPC] Getting models for provider: ${provider}`);
                const models = getProviderModelsWithDefaults(provider as keyof typeof PROVIDER_MODELS) || [];
                logger.info(`[settingsIPC] Returning ${models.length} models:`, models);
                return {
                    success: true,
                    models
                };
            } catch (error) {
                logger.error('[settingsIPC] Error getting models:', error);
                return { success: false, error: 'Failed to get models' };
            }
        });

        // Test MCP server connection
        ipcMain.handle('settings:test-mcp-connection', async (event, serverConfig: any) => {
            try {
                logger.info(`[settingsIPC] Testing MCP connection for server: ${serverConfig.name}`);
                
                // Import MCPManager dynamically to avoid circular dependencies
                const { MCPManager } = await import('@core/integrations/mcp/mcp-manager');
                const testManager = new MCPManager();
                
                const result = await testManager.testConnection(serverConfig);
                logger.info(`[settingsIPC] MCP connection test result:`, result);
                
                return {
                    success: true,
                    result
                };
            } catch (error) {
                logger.error('[settingsIPC] Error testing MCP connection:', error);
                return { success: false, error: 'Failed to test MCP connection' };
            }
        });

        // Get MCP server status 
        ipcMain.handle('settings:get-mcp-status', async () => {
            try {
                const configManager = ConfigurationManager.getInstance();
                const config = configManager.get();
                const mcpConfig = config.integrations?.mcp;
                
                // Get basic status and tool counts from agent
                let connectionStatus = {};
                let toolCounts = {};
                let agentReady = false;
                
                try {
                    const { getAgentBridge } = await import('@core/platform/ipc/agent-bridge');
                    const agentBridge = getAgentBridge();
                    
                    if (agentBridge?.isReady()) {
                        const athenaAgent = (agentBridge as any).athenaAgent;
                        agentReady = athenaAgent?.isReady() || false;
                        
                        if (athenaAgent?.getMCPStatus) {
                            const mcpStatus = athenaAgent.getMCPStatus();
                            connectionStatus = mcpStatus.servers || {};
                        }
                        
                        if (athenaAgent?.getMCPToolCounts) {
                            toolCounts = athenaAgent.getMCPToolCounts();
                        }
                    }
                } catch (error) {
                    logger.debug(`[settingsIPC] Could not get MCP status from agent:`, error);
                }
                
                return {
                    success: true,
                    status: {
                        enabled: mcpConfig?.enabled || false,
                        agentReady,
                        connectionStatus,
                        toolCounts
                    }
                };
            } catch (error) {
                logger.error('[settingsIPC] Error getting MCP status:', error);
                return { success: false, error: 'Failed to get MCP status' };
            }
        });

        // Subscribe to MCP status changes for real-time updates
        ipcMain.handle('settings:subscribe-mcp-events', async (event) => {
            try {
                const { getAgentBridge } = await import('@core/platform/ipc/agent-bridge');
                const agentBridge = getAgentBridge();
                
                if (agentBridge?.isReady()) {
                    const athenaAgent = (agentBridge as any).athenaAgent;
                    if (athenaAgent?.mcpManager) {
                        // Set up event forwarding to settings renderer
                        const forwardMCPEvents = (serverId: string, status: { connected: boolean; toolCount?: number; error?: string }) => {
                            event.sender.send('mcp-status-changed', { serverId, status });
                        };
                        
                        // Subscribe to MCP events
                        athenaAgent.mcpManager.onConnectionStatusChange(forwardMCPEvents);
                        
                        // Store cleanup function for this specific renderer
                        const cleanup = () => {
                            athenaAgent.mcpManager.offConnectionStatusChange(forwardMCPEvents);
                        };
                        
                        // Clean up when renderer window closes
                        event.sender.on('destroyed', cleanup);
                        
                        logger.debug(`[settingsIPC] Subscribed to MCP events`);
                        return { success: true };
                    }
                }
                
                return { success: false, error: 'Agent not ready' };
            } catch (error) {
                logger.error('[settingsIPC] Error subscribing to MCP events:', error);
                return { success: false, error: 'Failed to subscribe to MCP events' };
            }
        });

        // Reload MCP configuration
        ipcMain.handle('settings:reload-mcp', async () => {
            try {
                logger.info(`[settingsIPC] Reloading MCP configuration`);
                
                // Trigger configuration reload
                const configManager = ConfigurationManager.getInstance();
                await configManager.load();
                
                // Note: Agent will automatically refresh tools when MCP servers connect via event listeners
                // No need for manual refresh coordination
                
                logger.info(`[settingsIPC] MCP configuration reloaded successfully`);
                
                return { success: true };
            } catch (error) {
                logger.error('[settingsIPC] Error reloading MCP:', error);
                return { success: false, error: 'Failed to reload MCP configuration' };
            }
        });

        // Update specific MCP server
        ipcMain.handle('settings:update-mcp-server', async (event, serverId: string, serverConfig: any) => {
            try {
                const configManager = ConfigurationManager.getInstance();
                const config = configManager.get();
                const mcpConfig = { ...config.integrations?.mcp };
                
                if (!mcpConfig.servers) {
                    return { success: false, error: 'No MCP servers configured' };
                }
                
                const serverIndex = mcpConfig.servers.findIndex(s => s.name === serverId);
                if (serverIndex === -1) {
                    return { success: false, error: 'Server not found' };
                }
                
                mcpConfig.servers[serverIndex] = { ...mcpConfig.servers[serverIndex], ...serverConfig };
                
                await configManager.update({
                    integrations: {
                        ...config.integrations,
                        mcp: {
                            enabled: mcpConfig.enabled ?? false,
                            servers: mcpConfig.servers ?? [],
                            ...mcpConfig
                        }
                    }
                });
                
                return { success: true };
            } catch (error) {
                logger.error('[settingsIPC] Error updating MCP server:', error);
                return { success: false, error: 'Failed to update MCP server' };
            }
        });

        // Add new MCP server
        ipcMain.handle('settings:add-mcp-server', async (event, serverConfig: any) => {
            try {
                const configManager = ConfigurationManager.getInstance();
                const config = configManager.get();
                const mcpConfig = { ...config.integrations?.mcp };
                
                if (!mcpConfig.servers) {
                    mcpConfig.servers = [];
                }
                
                // Check if server name already exists
                if (mcpConfig.servers.some(s => s.name === serverConfig.name)) {
                    return { success: false, error: 'Server name already exists' };
                }
                
                mcpConfig.servers.push(serverConfig);
                
                await configManager.update({
                    integrations: {
                        ...config.integrations,
                        mcp: {
                            enabled: mcpConfig.enabled ?? false,
                            servers: mcpConfig.servers ?? [],
                            ...mcpConfig
                        }
                    }
                });
                
                return { success: true };
            } catch (error) {
                logger.error('[settingsIPC] Error adding MCP server:', error);
                return { success: false, error: 'Failed to add MCP server' };
            }
        });

        // Remove MCP server
        ipcMain.handle('settings:remove-mcp-server', async (event, serverId: string) => {
            try {
                const configManager = ConfigurationManager.getInstance();
                const config = configManager.get();
                const mcpConfig = { ...config.integrations?.mcp };
                
                if (!mcpConfig.servers) {
                    return { success: false, error: 'No MCP servers configured' };
                }
                
                mcpConfig.servers = mcpConfig.servers.filter(s => s.name !== serverId);
                
                await configManager.update({
                    integrations: {
                        ...config.integrations,
                        mcp: {
                            enabled: mcpConfig.enabled ?? false,
                            servers: mcpConfig.servers ?? [],
                            ...mcpConfig
                        }
                    }
                });
                
                return { success: true };
            } catch (error) {
                logger.error('[settingsIPC] Error removing MCP server:', error);
                return { success: false, error: 'Failed to remove MCP server' };
            }
        });

        // Toggle MCP server enabled state
        ipcMain.handle('settings:toggle-mcp-server', async (event, serverId: string, enabled: boolean) => {
            try {
                const configManager = ConfigurationManager.getInstance();
                const config = configManager.get();
                const mcpConfig = { ...config.integrations?.mcp };
                
                if (!mcpConfig.servers) {
                    return { success: false, error: 'No MCP servers configured' };
                }
                
                const serverIndex = mcpConfig.servers.findIndex(s => s.name === serverId);
                if (serverIndex === -1) {
                    return { success: false, error: 'Server not found' };
                }
                
                mcpConfig.servers[serverIndex].enabled = enabled;
                
                await configManager.update({
                    integrations: {
                        ...config.integrations,
                        mcp: {
                            enabled: mcpConfig.enabled ?? false,
                            servers: mcpConfig.servers ?? [],
                            ...mcpConfig
                        }
                    }
                });
                
                return { success: true };
            } catch (error) {
                logger.error('[settingsIPC] Error toggling MCP server:', error);
                return { success: false, error: 'Failed to toggle MCP server' };
            }
        });

        // Open BYOK widget for API key management
        ipcMain.on('settings:open-byok-widget', () => {
            const byokInstance = allAppInstances?.get('byokwidget');
            if (byokInstance && byokInstance.focus) {
                byokInstance.focus();
                logger.info('[settingsIPC] BYOK widget focused from Settings app');
            } else {
                logger.warn('[settingsIPC] BYOK widget instance not found - it may have been closed');
                // TODO: Could implement widget recreation here if needed
            }
        });

        // Focus the app window
        ipcMain.on('settings:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[settingsIPC] settings IPC handlers registered successfully');
    }
};

export default SettingsIpcHandlers;