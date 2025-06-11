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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EventEmitter } from 'events';
import { MCPConfig, MCPServerConfig } from '../../infrastructure/config/config';
import { ConfigurableComponent } from '../../infrastructure/config/configurable-component';

const logger = createLogger('[MCP]');

/**
 * Interface for MCP transport factory
 */
interface MCPTransportFactory {
    createTransport(config: MCPServerConfig): Promise<any>;
    validateConfig(config: MCPServerConfig): string[];
}

/**
 * Interface for MCP client management with enhanced protocol support
 */
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
 * Interface for MCP component filtering (Tools, Resources, Prompts)
 */
interface MCPComponentFilter {
    shouldIncludeTool(toolName: string, serverConfig: MCPServerConfig): boolean;
    shouldIncludeResource(resourceUri: string, serverConfig: MCPServerConfig): boolean;
    shouldIncludePrompt(promptName: string, serverConfig: MCPServerConfig): boolean;
    filterTools(tools: any[], serverConfig: MCPServerConfig): any[];
    filterResources(resources: any[], serverConfig: MCPServerConfig): any[];
    filterPrompts(prompts: any[], serverConfig: MCPServerConfig): any[];
}

/**
 * Interface for OAuth 2.1 authentication
 */
interface OAuth2AuthManager {
    authenticate(authConfig: any): Promise<string>;
    refreshToken(authConfig: any): Promise<string>;
    isTokenValid(token: string): boolean;
}

/**
 * OAuth 2.1 authentication implementation
 */
class OAuth2AuthManagerImpl implements OAuth2AuthManager {
    private tokenCache = new Map<string, { token: string; expires: Date }>();

    async authenticate(authConfig: any): Promise<string> {
        if (authConfig.type === 'bearer' && authConfig.token) {
            return authConfig.token;
        }

        if (authConfig.type === 'basic' && authConfig.username && authConfig.password) {
            return Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
        }

        if (authConfig.type === 'oauth2.1' && authConfig.clientId && authConfig.clientSecret && authConfig.tokenUrl) {
            const cacheKey = `${authConfig.clientId}:${authConfig.tokenUrl}`;
            const cached = this.tokenCache.get(cacheKey);
            
            if (cached && cached.expires > new Date()) {
                return cached.token;
            }

            // Implement OAuth 2.1 client credentials flow
            const response = await fetch(authConfig.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${authConfig.clientId}:${authConfig.clientSecret}`).toString('base64')}`
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    scope: authConfig.scopes?.join(' ') || ''
                })
            });

            if (!response.ok) {
                throw new Error(`OAuth 2.1 authentication failed: ${response.statusText}`);
            }

            const tokenData = await response.json();
            const token = tokenData.access_token;
            const expiresIn = tokenData.expires_in || 3600;
            
            this.tokenCache.set(cacheKey, {
                token,
                expires: new Date(Date.now() + (expiresIn * 1000))
            });

            return token;
        }

        throw new Error(`Unsupported authentication type: ${authConfig.type}`);
    }

    async refreshToken(authConfig: any): Promise<string> {
        // For simplicity, just re-authenticate
        return this.authenticate(authConfig);
    }

    isTokenValid(token: string): boolean {
        // Basic token validation - in production, this should verify JWT signatures
        return Boolean(token && token.length > 0);
    }
}

/**
 * Enhanced MCP transport factory with protocol v2025.3.26 support
 */
class MCPTransportFactoryImpl implements MCPTransportFactory {
    private authManager = new OAuth2AuthManagerImpl();

    async createTransport(config: MCPServerConfig): Promise<any> {
        switch (config.transport) {
            case 'stdio':
                if (!config.stdio) {
                    throw new Error(`[MCP] STDIO configuration missing for server: ${config.name}`);
                }
                
                // Build command and args based on executor
                let command: string;
                let args: string[] = [];
                
                switch (config.stdio.executor) {
                    case 'npx':
                        command = 'npx';
                        args = ['-y', config.stdio.command, ...config.stdio.args];
                        break;
                    case 'uvx':
                        command = 'uvx';
                        args = [config.stdio.command, ...config.stdio.args];
                        break;
                    case 'docker':
                        command = 'docker';
                        args = [
                            'run',
                            '--rm', // Remove container after execution
                            '-i', // interactive mode for stdio
                            ...(config.stdio.dockerArgs || []),
                        ];
                        
                        // Add environment variables
                        if (config.stdio.dockerEnv) {
                            Object.entries(config.stdio.dockerEnv).forEach(([key, value]) => {
                                args.push('-e', `${key}=${value}`);
                            });
                        }
                        
                        // Add the docker image
                        if (config.stdio.dockerImage) {
                            args.push(config.stdio.dockerImage);
                        } else {
                            throw new Error(`[MCP] Docker image required for server: ${config.name}`);
                        }
                        
                        // Add any additional command args
                        args.push(...config.stdio.args);
                        break;
                    case 'direct':
                    default:
                        command = config.stdio.command;
                        args = config.stdio.args;
                        break;
                }
                
                return new StdioClientTransport({
                    command,
                    args,
                    env: { 
                        ...Object.fromEntries(
                            Object.entries(process.env).filter(([_, value]) => value !== undefined)
                        ) as Record<string, string>, 
                        ...config.stdio.env 
                    },
                    cwd: config.stdio.cwd
                });

            case 'sse':
                if (!config.sse) {
                    throw new Error(`[MCP] SSE configuration missing for server: ${config.name}`);
                }
                logger.warn(`[MCP] SSE transport is deprecated. Consider migrating to streamableHttp transport for server: ${config.name}`);
                return new SSEClientTransport(new URL(config.sse.url));

            case 'streamableHttp':
                if (!config.streamableHttp) {
                    throw new Error(`[MCP] Streamable HTTP configuration missing for server: ${config.name}`);
                }
                
                // Prepare headers with authentication
                const headers = { ...config.streamableHttp.headers };
                
                if (config.streamableHttp.auth) {
                    const token = await this.authManager.authenticate(config.streamableHttp.auth);
                    
                    switch (config.streamableHttp.auth.type) {
                        case 'bearer':
                        case 'oauth2.1':
                            headers['Authorization'] = `Bearer ${token}`;
                            break;
                        case 'basic':
                            headers['Authorization'] = `Basic ${token}`;
                            break;
                    }
                }

                // Note: This is a placeholder for Streamable HTTP transport
                // The actual implementation would depend on the MCP SDK updates
                logger.info(`[MCP] Creating Streamable HTTP transport for ${config.name} with batching: ${config.streamableHttp.enableBatching}`);
                
                // For now, fall back to SSE transport with enhanced configuration
                return new SSEClientTransport(new URL(config.streamableHttp.url));

            case 'http':
                if (!config.http) {
                    throw new Error(`[MCP] HTTP configuration missing for server: ${config.name}`);
                }
                
                // Custom HTTP transport implementation would go here
                // For now, log a warning about limited support
                logger.warn(`HTTP transport has limited support. Consider using streamableHttp for server: ${config.name}`);
                throw new Error(`HTTP transport not fully implemented for server: ${config.name}`);

            default:
                throw new Error(`[MCP] Unsupported transport type: ${config.transport} for server: ${config.name}`);
        }
    }

    validateConfig(config: MCPServerConfig): string[] {
        const errors: string[] = [];

        switch (config.transport) {
            case 'stdio':
                if (!config.stdio) {
                    errors.push('STDIO configuration is required for stdio transport');
                } else {
                    if (!config.stdio.command) {
                        errors.push('STDIO command is required');
                    }
                    if (config.stdio.executor === 'docker' && !config.stdio.dockerImage) {
                        errors.push('Docker image is required when using docker executor');
                    }
                }
                break;

            case 'sse':
                if (!config.sse) {
                    errors.push('SSE configuration is required for sse transport');
                } else {
                    try {
                        new URL(config.sse.url);
                    } catch {
                        errors.push('SSE URL must be a valid URL');
                    }
                }
                // Add deprecation warning
                logger.warn(`[MCP] SSE transport is deprecated for server: ${config.name}. Please migrate to streamableHttp.`);
                break;

            case 'streamableHttp':
                if (!config.streamableHttp) {
                    errors.push('Streamable HTTP configuration is required for streamableHttp transport');
                } else {
                    try {
                        new URL(config.streamableHttp.url);
                    } catch {
                        errors.push('Streamable HTTP URL must be a valid URL');
                    }

                    // Validate authentication configuration
                    if (config.streamableHttp.auth) {
                        const auth = config.streamableHttp.auth;
                        if (auth.type === 'oauth2.1') {
                            if (!auth.clientId || !auth.clientSecret || !auth.tokenUrl) {
                                errors.push('OAuth 2.1 requires clientId, clientSecret, and tokenUrl');
                            }
                        } else if (auth.type === 'bearer' && !auth.token) {
                            errors.push('Bearer authentication requires token');
                        } else if (auth.type === 'basic' && (!auth.username || !auth.password)) {
                            errors.push('Basic authentication requires username and password');
                        }
                    }
                }
                break;

            case 'http':
                if (!config.http) {
                    errors.push('HTTP configuration is required for http transport');
                } else {
                    try {
                        new URL(config.http.url);
                    } catch {
                        errors.push('HTTP URL must be a valid URL');
                    }
                }
                break;

            default:
                errors.push(`Unsupported transport type: ${config.transport}`);
        }

        return errors;
    }
}

/**
 * Enhanced MCP component filter with Resources and Prompts support
 * Uses sensible defaults to be server-agnostic
 */
class MCPComponentFilterImpl implements MCPComponentFilter {
    shouldIncludeTool(toolName: string, serverConfig: MCPServerConfig): boolean {
        const filters = serverConfig.toolFilters;
        const componentFilters = serverConfig.componentFilters;
        
        // Default to enabling tools unless explicitly disabled
        if (componentFilters && componentFilters.enableTools === false) {
            return false;
        }
        
        if (!filters) return true;

        // Check blocked tools first
        if (filters.blockedTools && filters.blockedTools.includes(toolName)) {
            return false;
        }

        // Check allowed tools - if not specified, allow all
        if (filters.allowedTools && filters.allowedTools.length > 0) {
            return filters.allowedTools.includes(toolName);
        }

        return true;
    }

    shouldIncludeResource(resourceUri: string, serverConfig: MCPServerConfig): boolean {
        const componentFilters = serverConfig.componentFilters;
        
        // Default to enabling resources unless explicitly disabled
        if (!componentFilters || componentFilters.enableResources !== false) {
            // Check blocked resources first
            if (componentFilters?.blockedResources && componentFilters.blockedResources.includes(resourceUri)) {
                return false;
            }

            // Check allowed resources - if not specified, allow all
            if (componentFilters?.allowedResources && componentFilters.allowedResources.length > 0) {
                return componentFilters.allowedResources.includes(resourceUri);
            }

            return true;
        }

        return false;
    }

    shouldIncludePrompt(promptName: string, serverConfig: MCPServerConfig): boolean {
        const componentFilters = serverConfig.componentFilters;
        
        // Default to enabling prompts unless explicitly disabled
        if (!componentFilters || componentFilters.enablePrompts !== false) {
            // Check blocked prompts first
            if (componentFilters?.blockedPrompts && componentFilters.blockedPrompts.includes(promptName)) {
                return false;
            }

            // Check allowed prompts - if not specified, allow all
            if (componentFilters?.allowedPrompts && componentFilters.allowedPrompts.length > 0) {
                return componentFilters.allowedPrompts.includes(promptName);
            }

            return true;
        }

        return false;
    }

    filterTools(tools: any[], serverConfig: MCPServerConfig): any[] {
        return tools.filter(tool => this.shouldIncludeTool(tool.name, serverConfig));
    }

    filterResources(resources: any[], serverConfig: MCPServerConfig): any[] {
        return resources.filter(resource => this.shouldIncludeResource(resource.uri, serverConfig));
    }

    filterPrompts(prompts: any[], serverConfig: MCPServerConfig): any[] {
        return prompts.filter(prompt => this.shouldIncludePrompt(prompt.name, serverConfig));
    }
}

/**
 * MCP server connection wrapper with enhanced protocol support
 */
interface MCPConnection {
    client: Client;
    transport: any;
    config: MCPServerConfig;
    connected: boolean;
    tools: DynamicStructuredTool[];
    resources: any[];
    prompts: any[];
    lastConnected?: Date;
    connectionAttempts: number;
    protocolVersion?: string;
    capabilities?: {
        tools?: any;
        resources?: any;
        prompts?: any;
        logging?: any;
        sampling?: any;
    };
    error?: string;
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
                if (!this.deepEqual(connection.config, serverConfig)) {
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
        try {
            // Validate configuration
            const errors = this.transportFactory.validateConfig(config);
            if (errors.length > 0) {
                throw new Error(`[MCP] Invalid configuration for ${serverId}: ${errors.join(', ')}`);
            }

            // Create transport and client
            const transport = await this.transportFactory.createTransport(config);
            const client = new Client({
                name: `athena-mcp-${serverId}`,
                version: '1.0.0'
            }, {
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {}
                }
            });

            // Connect with timeout
            const connectPromise = client.connect(transport);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), config.timeout || 10000)
            );

            await Promise.race([connectPromise, timeoutPromise]);

            // Get available tools
            const toolsResult = await client.listTools();
            const tools = await this.convertToLangChainTools(toolsResult.tools || [], client, config);

            // Get available resources (optional MCP feature)
            let resources: any[] = [];
            try {
                const resourcesResult = await client.listResources();
                resources = this.convertToResources(resourcesResult.resources || [], client, config);
            } catch (error) {
                // Resources are optional in MCP - not all servers implement them
                logger.debug(`[MCP] Server ${serverId} does not support resources (optional feature)`);
            }

            // Get available prompts (optional MCP feature)
            let prompts: any[] = [];
            try {
                const promptsResult = await client.listPrompts();
                prompts = this.convertToPrompts(promptsResult.prompts || [], client, config);
            } catch (error) {
                // Prompts are optional in MCP - not all servers implement them
                logger.debug(`[MCP] Server ${serverId} does not support prompts (optional feature)`);
            }

            // Store connection
            const connection: MCPConnection = {
                client,
                transport,
                config,
                connected: true,
                tools,
                resources,
                prompts,
                lastConnected: new Date(),
                connectionAttempts: 0
            };

            this.connections.set(serverId, connection);
            if (tools.length > 0 || resources.length > 0 || prompts.length > 0) {
                logger.info(`[MCP] Connected to ${serverId}: ${tools.length} tools, ${resources.length} resources, ${prompts.length} prompts`);
            } else {
                logger.debug(`[MCP] Connected to ${serverId} (no capabilities)`);
            }

            // Emit connection success event
            this.emitConnectionStatusChange(serverId, {
                connected: true,
                toolCount: tools.length
            });

        } catch (error) {
            logger.error(`Failed to connect to server ${serverId}:`, error);
            
            // Store failed connection state with error information for UI display
            const failedConnection: MCPConnection = {
                client: null as any, // No client for failed connection
                transport: null as any, // No transport for failed connection  
                config,
                connected: false,
                tools: [],
                resources: [],
                prompts: [],
                lastConnected: undefined,
                connectionAttempts: (this.connections.get(serverId)?.connectionAttempts || 0) + 1,
                error: error instanceof Error ? error.message : 'Connection failed'
            };
            
            this.connections.set(serverId, failedConnection);
            
            // Emit connection failure event with error details
            this.emitConnectionStatusChange(serverId, {
                connected: false,
                error: error instanceof Error ? error.message : 'Connection failed',
                toolCount: 0
            });
            
            // Don't rethrow - we want to continue with other servers
            logger.warn(`Server ${serverId} connection failed, stored error state for UI`);
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

        try {
            // Only close client if it exists (failed connections won't have a client)
            if (connection.connected && connection.client) {
                await connection.client.close();
            }
            this.connections.delete(serverId);
            logger.info(`[MCP] Disconnected from server: ${serverId}`);
            
            // Emit disconnection event
            this.emitConnectionStatusChange(serverId, {
                connected: false
            });
        } catch (error) {
            logger.error(`[MCP] Error disconnecting from server ${serverId}:`, error);
            // Remove the connection anyway
            this.connections.delete(serverId);
            
            // Emit disconnection event even on error
            this.emitConnectionStatusChange(serverId, {
                connected: false,
                error: error instanceof Error ? error.message : 'Disconnection error'
            });
        }
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

        await this.disconnect(serverId);
        await this.connect(serverId, connection.config);
    }

    /**
     * Check if server is connected
     */
    isConnected(serverId: string): boolean {
        const connection = this.connections.get(serverId);
        return connection?.connected || false;
    }

    /**
     * Get tools from specific server or all servers
     */
    getTools(serverId?: string): DynamicStructuredTool[] {
        if (serverId) {
            const connection = this.connections.get(serverId);
            const tools = connection?.connected ? connection.tools : [];
            return tools;
        }

        // Return all tools from all connected servers
        const allTools: DynamicStructuredTool[] = [];
        for (const [connectionId, connection] of this.connections.entries()) {
            if (connection.connected) {
                const serverTools = connection.tools || [];
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
            return connection?.connected ? connection.resources : [];
        }

        // Return all resources from all connected servers
        const allResources: any[] = [];
        for (const connection of this.connections.values()) {
            if (connection.connected) {
                allResources.push(...connection.resources);
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
            return connection?.connected ? connection.prompts : [];
        }

        // Return all prompts from all connected servers
        const allPrompts: any[] = [];
        for (const connection of this.connections.values()) {
            if (connection.connected) {
                allPrompts.push(...connection.prompts);
            }
        }
        return allPrompts;
    }

    /**
     * Get list of connected server IDs
     */
    getConnectedServers(): string[] {
        return Array.from(this.connections.entries())
            .filter(([_, connection]) => connection.connected)
            .map(([serverId, _]) => serverId);
    }

    /**
     * Disconnect all servers
     */
    private async disconnectAll(): Promise<void> {
        const serverIds = Array.from(this.connections.keys());
        await Promise.all(serverIds.map(id => this.disconnect(id)));
    }

    /**
     * Convert MCP tools to LangChain tools with enhanced annotations support
     * Uses @modelcontextprotocol/sdk as primary implementation,
     * with @langchain/mcp-adapters available as fallback for complex scenarios
     */
    private async convertToLangChainTools(
        mcpTools: any[], 
        client: Client, 
        config: MCPServerConfig
    ): Promise<DynamicStructuredTool[]> {
        // Filter tools based on configuration
        const filteredTools = this.componentFilter.filterTools(mcpTools, config);
        
        // Primary approach: Manual conversion using official MCP SDK
        const langchainTools: DynamicStructuredTool[] = [];

        for (const tool of filteredTools) {
            try {
                const langchainTool = new DynamicStructuredTool({
                    name: `${config.name}_${tool.name}`,
                    description: tool.description || `Tool from MCP server: ${config.name}`,
                    schema: tool.inputSchema || {},
                    func: async (args: any) => {
                        try {
                            const result = await client.callTool({
                                name: tool.name,
                                arguments: args
                            });
                            
                            // Handle tool annotations if supported
                            if (config.toolAnnotations?.enableMetadata && result.content) {
                                const content = Array.isArray(result.content) ? result.content : [result.content];
                                const annotatedContent = content.map((item: any) => {
                                    if (item.annotations) {
                                        logger.debug(`[MCP] Tool ${tool.name} returned annotated content:`, item.annotations);
                                    }
                                    return item;
                                });
                                return JSON.stringify(annotatedContent);
                            }
                            
                            return JSON.stringify(result.content);
                        } catch (error) {
                            logger.error(`[MCP] Tool execution failed for ${tool.name}:`, error);
                            throw error;
                        }
                    }
                });

                // Add serverId metadata for UI display
                (langchainTool as any).serverId = config.name;

                langchainTools.push(langchainTool);
            } catch (error) {
                logger.error(`[MCP] Failed to convert tool ${tool.name} from server ${config.name}:`, error);
            }
        }

        return langchainTools;
    }

    /**
     * Convert MCP resources to usable resource objects
     */
    private convertToResources(
        mcpResources: any[], 
        client: Client, 
        config: MCPServerConfig
    ): any[] {
        // Filter resources based on configuration
        const filteredResources = this.componentFilter.filterResources(mcpResources, config);
        
        const resources: any[] = [];

        for (const resource of filteredResources) {
            try {
                const resourceObject = {
                    uri: resource.uri,
                    name: resource.name || resource.uri,
                    description: resource.description,
                    mimeType: resource.mimeType,
                    serverName: config.name,
                    // Store the client reference for lazy loading content
                    _client: client,
                    async getContent() {
                        try {
                            const result = await client.readResource({ uri: this.uri });
                            return result.contents;
                        } catch (error) {
                            logger.error(`[MCP] Failed to read resource ${this.uri}:`, error);
                            throw error;
                        }
                    }
                };
                resources.push(resourceObject);
            } catch (error) {
                logger.error(`[MCP] Failed to convert resource ${resource.uri} from server ${config.name}:`, error);
            }
        }

        return resources;
    }

    /**
     * Convert MCP prompts to usable prompt objects
     */
    private convertToPrompts(
        mcpPrompts: any[], 
        client: Client, 
        config: MCPServerConfig
    ): any[] {
        // Filter prompts based on configuration
        const filteredPrompts = this.componentFilter.filterPrompts(mcpPrompts, config);
        
        const prompts: any[] = [];

        for (const prompt of filteredPrompts) {
            try {
                const promptObject = {
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments,
                    serverName: config.name,
                    // Store the client reference for lazy loading content
                    _client: client,
                    async getMessages(args: any = {}) {
                        try {
                            const result = await client.getPrompt({
                                name: this.name,
                                arguments: args
                            });
                            return result.messages;
                        } catch (error) {
                            logger.error(`[MCP] Failed to get prompt ${this.name}:`, error);
                            throw error;
                        }
                    }
                };
                prompts.push(promptObject);
            } catch (error) {
                logger.error(`[MCP] Failed to convert prompt ${prompt.name} from server ${config.name}:`, error);
            }
        }

        return prompts;
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
                connected: connection.connected,
                lastConnected: connection.lastConnected,
                attempts: connection.connectionAttempts,
                toolCount: connection.tools?.length || 0,
                error: connection.error
            };
        }
        return status;
    }

    /**
     * Test connection to a server configuration
     */
    async testConnection(config: MCPServerConfig): Promise<{ success: boolean; error?: string; toolCount?: number }> {
        try {
            const errors = this.transportFactory.validateConfig(config);
            if (errors.length > 0) {
                return { success: false, error: errors.join(', ') };
            }

            const transport = await this.transportFactory.createTransport(config);
            const client = new Client({
                name: `athena-mcp-test`,
                version: '1.0.0'
            }, {
                capabilities: {
                    tools: {},
                    resources: {},
                    prompts: {}
                }
            });

            await client.connect(transport);
            const toolsResult = await client.listTools();
            await client.close();

            return { 
                success: true, 
                toolCount: this.componentFilter.filterTools(toolsResult.tools || [], config).length 
            };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
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