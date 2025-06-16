/**
 * MCP Manager
 * 
 * Manages Model Context Protocol server connections and tool integration
 * Enhanced with modern OOP design patterns for better maintainability
 * Supports multiple MCP transports with hot configuration reloading
 * Updated to support MCP Protocol v2025.3.26 specifications
 */

import { createLogger } from '@/lib/utils/logger';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { EventEmitter } from 'events';
import { MCPConfig, MCPServerConfig } from '../../infrastructure/config/config';
import { ConfigurableComponent } from '../../infrastructure/config/configurable-component';
import { MCPComponentFilter, MCPComponentFilterImpl, MCPConnection } from './connection';
import { MCPTransportFactory, MCPTransportFactoryImpl } from './transports';

const logger = createLogger('[MCP]');

interface MCPClientManager {
    connect(serverId: string, config: MCPServerConfig): Promise<void>;
    disconnect(serverId: string): Promise<void>;
    reconnect(serverId: string): Promise<void>;
    isConnected(serverId: string): boolean;
    getTools(serverId?: string): DynamicStructuredTool[];
    getResources(serverId?: string): any[];
    getPrompts(serverId?: string): any[];
    getConnectedServers(): string[];
}

/**
 * Dependency injection interface for MCP Manager
 */
interface MCPManagerDependencies {
    transportFactory?: MCPTransportFactory;
    componentFilter?: MCPComponentFilter;
}

export class MCPManager extends ConfigurableComponent<MCPConfig> implements MCPClientManager {
    private connections = new Map<string, MCPConnection>();
    private initialized = false;
    private eventEmitter = new EventEmitter();
    
    // Injected dependencies
    private readonly transportFactory: MCPTransportFactory;
    private readonly componentFilter: MCPComponentFilter;

    constructor(dependencies?: MCPManagerDependencies) {
        super({
            configPath: 'integrations.mcp',
            defaultConfig: {
                enabled: false,
                servers: []
            }
        });
        
        this.transportFactory = dependencies?.transportFactory || new MCPTransportFactoryImpl();
        this.componentFilter = dependencies?.componentFilter || new MCPComponentFilterImpl();
        
        logger.info('[MCP] Manager created with enhanced MCP Protocol v2025.3.26 support');
    }

    /**
     * Initialize MCP manager with dependency injection pattern
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.warn('[MCP] Already initialized');
            return;
        }

        try {
            // Initial sync of connections based on current config
            await this.syncConnections();
            
            this.initialized = true;
            logger.info('[MCP] Manager fully initialized');
        } catch (error) {
            logger.error('[MCP] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Sync connections based on current configuration
     */
    private async syncConnections(): Promise<void> {
        const config = this.getConfig();
        
        if (!config.enabled) {
            logger.info('[MCP] MCP is disabled, disconnecting all servers');
            await this.disconnectAll();
            return;
        }

        const configuredServers = new Set(config.servers.filter(s => s.enabled).map(s => s.name));
        const connectedServers = new Set(this.connections.keys());

        // Disconnect servers that are no longer configured or disabled
        for (const serverId of connectedServers) {
            if (!configuredServers.has(serverId)) {
                logger.info(`[MCP] Disconnecting removed/disabled server: ${serverId}`);
                await this.disconnect(serverId);
            }
        }

        // Connect new servers
        for (const serverConfig of config.servers) {
            if (serverConfig.enabled && !this.connections.has(serverConfig.name)) {
                logger.info(`[MCP] Connecting new server: ${serverConfig.name}`);
                await this.connect(serverConfig.name, serverConfig);
            }
        }

        // Update existing connections if config changed
        for (const serverConfig of config.servers) {
            if (serverConfig.enabled && this.connections.has(serverConfig.name)) {
                const connection = this.connections.get(serverConfig.name)!;
                if (!this.deepEqual(connection.state.config, serverConfig)) {
                    logger.info(`[MCP] Reconnecting server with updated config: ${serverConfig.name}`);
                    await this.reconnect(serverConfig.name);
                }
            }
        }
    }

    /**
     * Connect to an MCP server
     */
    async connect(serverId: string, config: MCPServerConfig): Promise<void> {
        const connection = new MCPConnection(config, this.transportFactory, this.componentFilter);
        await connection.connect();
        this.connections.set(serverId, connection);

        if (connection.state.connected) {
            const tools = connection.state.tools.length;
            if (tools > 0 || connection.state.resources.length > 0 || connection.state.prompts.length > 0) {
                logger.info(`[MCP] Connected to ${serverId}: ${tools} tools, ${connection.state.resources.length} resources, ${connection.state.prompts.length} prompts`);
            } else {
                logger.debug(`[MCP] Connected to ${serverId} (no capabilities)`);
            }
            this.emitConnectionStatusChange(serverId, {
                connected: true,
                toolCount: tools
            });
        } else {
            logger.warn(`Server ${serverId} connection failed, stored error state for UI`);
            this.emitConnectionStatusChange(serverId, {
                connected: false,
                error: connection.state.error,
                toolCount: 0
            });
        }
    }

    /**
     * Disconnect from an MCP server
     */
    async disconnect(serverId: string): Promise<void> {
        const connection = this.connections.get(serverId);
        if (!connection) {
            logger.warn(`[MCP] No connection found for server: ${serverId}`);
            return;
        }

        await connection.disconnect();
        this.connections.delete(serverId);
        this.emitConnectionStatusChange(serverId, { connected: false });
    }

    /**
     * Reconnect to an MCP server
     */
    async reconnect(serverId: string): Promise<void> {
        const connection = this.connections.get(serverId);
        if (!connection) {
            logger.warn(`[MCP] No connection found for server: ${serverId}`);
            return;
        }

        const config = connection.state.config;
        await this.disconnect(serverId);
        await this.connect(serverId, config);
    }

    /**
     * Check if server is connected
     */
    isConnected(serverId: string): boolean {
        const connection = this.connections.get(serverId);
        return connection?.state.connected || false;
    }

    /**
     * Get tools from specific server or all servers
     */
    getTools(serverId?: string): DynamicStructuredTool[] {
        if (serverId) {
            const connection = this.connections.get(serverId);
            const tools = connection?.state.connected ? connection.state.tools : [];
            return tools;
        }

        // Return all tools from all connected servers
        const allTools: DynamicStructuredTool[] = [];
        for (const connection of this.connections.values()) {
            if (connection.state.connected) {
                const serverTools = connection.state.tools || [];
                allTools.push(...serverTools);
            }
        }
        return allTools;
    }

    /**
     * Get resources from specific server or all servers
     */
    getResources(serverId?: string): any[] {
        if (serverId) {
            const connection = this.connections.get(serverId);
            return connection?.state.connected ? connection.state.resources : [];
        }

        // Return all resources from all connected servers
        const allResources: any[] = [];
        for (const connection of this.connections.values()) {
            if (connection.state.connected) {
                allResources.push(...connection.state.resources);
            }
        }
        return allResources;
    }

    /**
     * Get prompts from specific server or all servers
     */
    getPrompts(serverId?: string): any[] {
        if (serverId) {
            const connection = this.connections.get(serverId);
            return connection?.state.connected ? connection.state.prompts : [];
        }

        // Return all prompts from all connected servers
        const allPrompts: any[] = [];
        for (const connection of this.connections.values()) {
            if (connection.state.connected) {
                allPrompts.push(...connection.state.prompts);
            }
        }
        return allPrompts;
    }

    /**
     * Get list of connected server IDs
     */
    getConnectedServers(): string[] {
        return Array.from(this.connections.entries())
            .filter(([_, connection]) => connection.state.connected)
            .map(([serverId]) => serverId);
    }

    /**
     * Disconnect all servers
     */
    private async disconnectAll(): Promise<void> {
        const serverIds = Array.from(this.connections.keys());
        await Promise.all(serverIds.map(id => this.disconnect(id)));
    }


    /**
     * Configuration change handler
     */
    protected async onConfigurationChange(newConfig: MCPConfig, previousConfig: MCPConfig): Promise<void> {
        logger.info(`[MCP] Configuration changed - Enabled: ${previousConfig.enabled} → ${newConfig.enabled}`);
        
        try {
            await this.syncConnections();
            logger.info('[MCP] Successfully updated to new configuration');
        } catch (error) {
            logger.error('[MCP] Failed to update configuration:', error);
        }
    }

    /**
     * Get connection status for all servers
     */
    getConnectionStatus(): { [serverId: string]: { connected: boolean; lastConnected?: Date; attempts: number; toolCount?: number; error?: string } } {
        const status: any = {};
        for (const [serverId, connection] of this.connections.entries()) {
            status[serverId] = {
                connected: connection.state.connected,
                lastConnected: connection.state.lastConnected,
                attempts: connection.state.connectionAttempts,
                toolCount: connection.state.tools?.length || 0,
                error: connection.state.error
            };
        }
        return status;
    }

    /**
     * Test connection to a server configuration
     */
    async testConnection(config: MCPServerConfig): Promise<{ success: boolean; error?: string; toolCount?: number }> {
        const connection = new MCPConnection(config, this.transportFactory, this.componentFilter);
        await connection.connect();
        const success = connection.state.connected;
        const result = {
            success,
            error: connection.state.error,
            toolCount: connection.state.tools.length
        };
        if (success) {
            await connection.disconnect();
        }
        return success ? { success: true, toolCount: result.toolCount } : { success: false, error: result.error };
    }

    async destroy(): Promise<void> {
        await this.disconnectAll();
        super.destroy();
        this.initialized = false;
        logger.info('[MCP] Manager destroyed');
    }

    /**
     * Subscribe to connection status change events
     */
    onConnectionStatusChange(callback: (serverId: string, status: { connected: boolean; toolCount?: number; error?: string }) => void): void {
        this.eventEmitter.on('connectionStatusChanged', callback);
    }

    /**
     * Unsubscribe from connection status change events
     */
    offConnectionStatusChange(callback: (serverId: string, status: { connected: boolean; toolCount?: number; error?: string }) => void): void {
        this.eventEmitter.off('connectionStatusChanged', callback);
    }

    /**
     * Emit connection status change event
     */
    private emitConnectionStatusChange(serverId: string, status: { connected: boolean; toolCount?: number; error?: string }): void {
        this.eventEmitter.emit('connectionStatusChanged', serverId, status);
        // Only log errors or significant state changes, not every status emit
        if (status.error) {
            logger.warn(`Server ${serverId} status: ${status.error}`);
        }
    }
}

// Export singleton instance for compatibility
export const mcpManager = new MCPManager(); 