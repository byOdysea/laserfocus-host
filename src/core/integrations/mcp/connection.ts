export interface MCPComponentFilter {
    shouldIncludeTool(toolName: string, serverConfig: MCPServerConfig): boolean;
    shouldIncludeResource(resourceUri: string, serverConfig: MCPServerConfig): boolean;
    shouldIncludePrompt(promptName: string, serverConfig: MCPServerConfig): boolean;
    filterTools(tools: any[], serverConfig: MCPServerConfig): any[];
    filterResources(resources: any[], serverConfig: MCPServerConfig): any[];
    filterPrompts(prompts: any[], serverConfig: MCPServerConfig): any[];
}
import { createLogger } from '@/lib/utils/logger';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { MCPServerConfig } from '../../infrastructure/config/config';
import { MCPTransportFactory } from './transports';

const logger = createLogger('[MCP]');

export class MCPComponentFilterImpl implements MCPComponentFilter {
    shouldIncludeTool(toolName: string, serverConfig: MCPServerConfig): boolean {
        const filters = serverConfig.toolFilters;
        const componentFilters = serverConfig.componentFilters;
        if (componentFilters && componentFilters.enableTools === false) {
            return false;
        }
        if (!filters) return true;
        if (filters.blockedTools && filters.blockedTools.includes(toolName)) {
            return false;
        }
        if (filters.allowedTools && filters.allowedTools.length > 0) {
            return filters.allowedTools.includes(toolName);
        }
        return true;
    }
    shouldIncludeResource(resourceUri: string, serverConfig: MCPServerConfig): boolean {
        const componentFilters = serverConfig.componentFilters;
        if (!componentFilters || componentFilters.enableResources !== false) {
            if (componentFilters?.blockedResources && componentFilters.blockedResources.includes(resourceUri)) {
                return false;
            }
            if (componentFilters?.allowedResources && componentFilters.allowedResources.length > 0) {
                return componentFilters.allowedResources.includes(resourceUri);
            }
            return true;
        }
        return false;
    }
    shouldIncludePrompt(promptName: string, serverConfig: MCPServerConfig): boolean {
        const componentFilters = serverConfig.componentFilters;
        if (!componentFilters || componentFilters.enablePrompts !== false) {
            if (componentFilters?.blockedPrompts && componentFilters.blockedPrompts.includes(promptName)) {
                return false;
            }
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

export interface MCPConnectionState {
    client: Client | null;
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

export class MCPConnection {
    state: MCPConnectionState;

    constructor(
        config: MCPServerConfig,
        private transportFactory: MCPTransportFactory,
        private componentFilter: MCPComponentFilter
    ) {
        this.state = {
            client: null,
            transport: null,
            config,
            connected: false,
            tools: [],
            resources: [],
            prompts: [],
            connectionAttempts: 0
        };
    }

    async connect(): Promise<void> {
        try {
            const errors = this.transportFactory.validateConfig(this.state.config);
            if (errors.length > 0) {
                throw new Error(errors.join(', '));
            }

            this.state.transport = await this.transportFactory.createTransport(this.state.config);
            this.state.client = new Client({
                name: `athena-mcp-${this.state.config.name}`,
                version: '1.0.0'
            }, {
                capabilities: { tools: {}, resources: {}, prompts: {} }
            });

            const connectPromise = this.state.client.connect(this.state.transport);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), this.state.config.timeout || 10000)
            );
            await Promise.race([connectPromise, timeoutPromise]);

            const toolsResult = await this.state.client.listTools();
            this.state.tools = await this.convertToLangChainTools(toolsResult.tools || [], this.state.client, this.state.config);

            this.state.resources = [];
            try {
                const resourcesResult = await this.state.client.listResources();
                this.state.resources = this.convertToResources(resourcesResult.resources || [], this.state.client, this.state.config);
            } catch (_) {
                logger.debug(`[MCP] Server ${this.state.config.name} does not support resources`);
            }

            this.state.prompts = [];
            try {
                const promptsResult = await this.state.client.listPrompts();
                this.state.prompts = this.convertToPrompts(promptsResult.prompts || [], this.state.client, this.state.config);
            } catch (_) {
                logger.debug(`[MCP] Server ${this.state.config.name} does not support prompts`);
            }

            this.state.connected = true;
            this.state.lastConnected = new Date();
            this.state.error = undefined;
        } catch (error) {
            logger.error(`Failed to connect to server ${this.state.config.name}:`, error);
            this.state.client = null;
            this.state.transport = null;
            this.state.connected = false;
            this.state.tools = [];
            this.state.resources = [];
            this.state.prompts = [];
            this.state.lastConnected = undefined;
            this.state.connectionAttempts += 1;
            this.state.error = error instanceof Error ? error.message : 'Connection failed';
        }
    }

    async disconnect(): Promise<void> {
        if (this.state.connected && this.state.client) {
            try {
                await this.state.client.close();
            } catch (err) {
                logger.error(`[MCP] Error disconnecting from server ${this.state.config.name}:`, err);
            }
        }
        this.state.connected = false;
        this.state.client = null;
        this.state.transport = null;
    }

    private async convertToLangChainTools(mcpTools: any[], client: Client, config: MCPServerConfig): Promise<DynamicStructuredTool[]> {
        const filtered = this.componentFilter.filterTools(mcpTools, config);
        const tools: DynamicStructuredTool[] = [];
        for (const tool of filtered) {
            try {
                const langchainTool = new DynamicStructuredTool({
                    name: `${config.name}_${tool.name}`,
                    description: tool.description || `Tool from MCP server: ${config.name}`,
                    schema: tool.inputSchema || {},
                    func: async (args: any) => {
                        const result = await client.callTool({ name: tool.name, arguments: args });
                        if (config.toolAnnotations?.enableMetadata && result.content) {
                            const content = Array.isArray(result.content) ? result.content : [result.content];
                            return JSON.stringify(content);
                        }
                        return JSON.stringify(result.content);
                    }
                });
                (langchainTool as any).serverId = config.name;
                tools.push(langchainTool);
            } catch (err) {
                logger.error(`[MCP] Failed to convert tool ${tool.name} from server ${config.name}:`, err);
            }
        }
        return tools;
    }

    private convertToResources(mcpResources: any[], client: Client, config: MCPServerConfig): any[] {
        const filtered = this.componentFilter.filterResources(mcpResources, config);
        const resources: any[] = [];
        for (const resource of filtered) {
            try {
                const obj = {
                    uri: resource.uri,
                    name: resource.name || resource.uri,
                    description: resource.description,
                    mimeType: resource.mimeType,
                    serverName: config.name,
                    _client: client,
                    async getContent() {
                        const result = await client.readResource({ uri: this.uri });
                        return result.contents;
                    }
                };
                resources.push(obj);
            } catch (err) {
                logger.error(`[MCP] Failed to convert resource ${resource.uri} from server ${config.name}:`, err);
            }
        }
        return resources;
    }

    private convertToPrompts(mcpPrompts: any[], client: Client, config: MCPServerConfig): any[] {
        const filtered = this.componentFilter.filterPrompts(mcpPrompts, config);
        const prompts: any[] = [];
        for (const prompt of filtered) {
            try {
                const obj = {
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments,
                    serverName: config.name,
                    _client: client,
                    async getMessages(args: any = {}) {
                        const result = await client.getPrompt({ name: this.name, arguments: args });
                        return result.messages;
                    }
                };
                prompts.push(obj);
            } catch (err) {
                logger.error(`[MCP] Failed to convert prompt ${prompt.name} from server ${config.name}:`, err);
            }
        }
        return prompts;
    }
}
