// src/core/mcp/MCPCoordinator.ts
// Implementation of the MCP Coordinator

import { Client } from '@modelcontextprotocol/sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { loadMCPConfig, MCPConfig, MCPServerConfig } from '../../config/mcpConfig';
import {
  MCPCoordinatorConfig,
  ServerToolDescriptionPrompts,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinition,
  ToolExecutionOptions,
  ToolRegistryEntry,
} from '../../types/mcp';
import {
  CircuitOpenError,
  ConfigurationError,
  ToolExecutionError,
  ToolNotFoundError,
  ToolValidationError,
} from '../../utils/errors';
import { createComponentLogger } from '../../utils/logger';
import { generateFallbackToolDescription } from './utils/generateFallbackPrompt';

const logger = createComponentLogger('MCPCoordinator');

/**
 * MCP Coordinator
 *
 * Manages connections to MCP servers, discovers tools, retrieves server-specific
 * tool usage guidance prompts, and handles tool execution requests.
 */
export class MCPCoordinator {
  private toolRegistry = new Map<string, ToolRegistryEntry>();
  private toolDescriptionPrompts = new Map<string, string>();
  private clients = new Map<string, Client>();
  private activeExecutions = new Map<
    string,
    {
      abortController: AbortController;
      timeout: NodeJS.Timeout;
    }
  >();
  private ajv: Ajv;
  private config: MCPCoordinatorConfig;

  /**
   * Creates a new MCP Coordinator
   * @param config Configuration options
   */
  constructor(config: Partial<MCPCoordinatorConfig> = {}) {
    this.config = {
      configPath: config.configPath || process.env.MCP_JSON_PATH || './mcp.json',
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitResetTimeMs: config.circuitResetTimeMs || 60000, // 1 minute
      defaultTimeoutMs: config.defaultTimeoutMs || 10000, // 10 seconds
    };

    logger.info({ configPath: this.config.configPath }, 'Creating MCP Coordinator');

    // Initialize JSON Schema validator
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
    });
    addFormats(this.ajv);
  }

  /**
   * Initializes the MCP Coordinator
   *
   * This loads the configuration, connects to servers, discovers tools,
   * fetches "tool-descriptions" prompts, and builds the tool registry.
   */
  async initialize(): Promise<void> {
    logger.info('Initializing MCP Coordinator');

    try {
      // Load and validate the configuration
      const mcpConfig = loadMCPConfig(this.config.configPath);
      logger.info(
        { serverCount: Object.keys(mcpConfig.servers).length },
        'Loaded MCP configuration',
      );

      // Initialize clients and discover tools
      await this.initializeClients(mcpConfig);
      await this.discoverToolsAndDescriptions();

      logger.info(
        { toolCount: this.toolRegistry.size },
        'MCP Coordinator initialized successfully',
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize MCP Coordinator');
      throw error;
    }
  }

  /**
   * Initializes clients for all servers in the configuration
   * @param mcpConfig The MCP configuration
   */
  private async initializeClients(mcpConfig: MCPConfig): Promise<void> {
    for (const [serverId, serverConfig] of Object.entries(mcpConfig.servers)) {
      try {
        logger.debug({ serverId, transport: serverConfig.transport }, 'Initializing MCP client');

        const client = await this.createClient(serverId, serverConfig);
        this.clients.set(serverId, client);

        logger.info({ serverId }, 'Successfully connected to MCP server');
      } catch (error) {
        logger.error({ serverId, error }, 'Failed to initialize MCP client');
        // Continue with other servers even if one fails
      }
    }
  }

  /**
   * Creates a client for an MCP server
   * @param serverId The server ID
   * @param serverConfig The server configuration
   * @returns An initialized MCP client
   */
  private async createClient(serverId: string, serverConfig: MCPServerConfig): Promise<Client> {
    try {
      let client: Client;

      if (serverConfig.transport === 'stdio') {
        if (!serverConfig.command) {
          throw new ConfigurationError(
            `Missing 'command' for stdio transport in server '${serverId}'`,
          );
        }

        client = new Client({
          transport: 'stdio',
          command: serverConfig.command,
          args: serverConfig.args || [],
        });
      } else if (serverConfig.transport === 'http') {
        if (!serverConfig.url) {
          throw new ConfigurationError(`Missing 'url' for http transport in server '${serverId}'`);
        }

        client = new Client({
          transport: 'http',
          url: serverConfig.url,
        });
      } else {
        throw new ConfigurationError(
          `Unsupported transport '${serverConfig.transport}' for server '${serverId}'`,
        );
      }

      // Connect to the server
      await client.connect();
      return client;
    } catch (error) {
      logger.error({ serverId, error }, 'Failed to create MCP client');
      throw new ConfigurationError(
        `Failed to create MCP client for server '${serverId}': ${(error as Error).message}`,
      );
    }
  }

  /**
   * Discovers tools and fetches/generates tool descriptions
   */
  private async discoverToolsAndDescriptions(): Promise<void> {
    for (const [serverId, client] of this.clients.entries()) {
      let toolDefinitions: ToolDefinition[] = [];

      try {
        // Discover tools
        logger.debug({ serverId }, 'Discovering tools');
        const toolsResponse = await client.listTools();

        if (!toolsResponse?.tools || !Array.isArray(toolsResponse.tools)) {
          logger.warn({ serverId, response: toolsResponse }, 'Invalid response from tools/list');
          continue;
        }

        toolDefinitions = toolsResponse.tools;
        logger.info({ serverId, toolCount: toolDefinitions.length }, 'Discovered tools');

        // Attempt to fetch "tool-descriptions" prompt
        try {
          logger.debug({ serverId }, 'Fetching tool-descriptions prompt');
          const promptResponse = await client.getPrompt('tool-descriptions');

          // Validate prompt response
          if (
            promptResponse?.messages &&
            Array.isArray(promptResponse.messages) &&
            promptResponse.messages.length === 1 &&
            promptResponse.messages[0].role === 'user' &&
            promptResponse.messages[0].content.type === 'text'
          ) {
            this.toolDescriptionPrompts.set(serverId, promptResponse.messages[0].content.text);
            logger.info({ serverId }, 'Successfully fetched tool-descriptions prompt');
          } else {
            throw new Error('Invalid prompt structure received');
          }
        } catch (promptError) {
          // Generate fallback description if prompt fetch fails
          logger.warn(
            { serverId, error: promptError },
            'Tool-descriptions prompt missing or invalid, generating fallback',
          );
          const fallbackPrompt = generateFallbackToolDescription(serverId, toolDefinitions);
          this.toolDescriptionPrompts.set(serverId, fallbackPrompt);
          logger.info({ serverId }, 'Generated fallback tool description prompt');
        }

        // Register tools in the registry
        this.registerTools(serverId, client, toolDefinitions);
      } catch (error) {
        logger.error({ serverId, error }, 'Failed to discover tools or fetch descriptions');
        // Continue with other servers even if one fails
      }
    }
  }

  /**
   * Registers tools in the tool registry
   * @param serverId The server ID
   * @param client The MCP client
   * @param tools The tool definitions
   */
  private registerTools(serverId: string, client: Client, tools: ToolDefinition[]): void {
    for (const tool of tools) {
      const qualifiedName = `${serverId}:${tool.name}`;

      // Check for name collisions with unqualified names
      const unqualifiedCollision = [...this.toolRegistry.values()].find(
        (entry) => entry.qualifiedName.endsWith(`:${tool.name}`) && entry.serverId !== serverId,
      );

      if (unqualifiedCollision) {
        logger.warn(
          { toolName: tool.name, serverId, collidingServer: unqualifiedCollision.serverId },
          'Tool name collision detected, only qualified names will work',
        );
      }

      // Store the tool in the registry
      this.toolRegistry.set(qualifiedName, {
        qualifiedName,
        definition: tool,
        serverId,
        client,
        transportType: client.transport as 'stdio' | 'http',
        reliability: {
          successCount: 0,
          failureCount: 0,
          circuitOpen: false,
        },
        performance: {
          avgResponseTimeMs: 0,
          callCount: 0,
          lastUsed: Date.now(),
        },
      });

      logger.debug({ qualifiedName }, 'Registered tool');
    }
  }

  /**
   * Resolves a tool name to a qualified name
   * @param toolName The tool name (can be qualified or unqualified)
   * @returns The qualified tool name
   * @throws {ToolNotFoundError} If the tool is not found
   */
  resolveToolName(toolName: string): string {
    // If already qualified, return as is
    if (toolName.includes(':')) {
      return toolName;
    }

    // Find tools with this unqualified name
    const matchingTools = [...this.toolRegistry.entries()].filter(([qualifiedName]) =>
      qualifiedName.endsWith(`:${toolName}`),
    );

    if (matchingTools.length === 0) {
      logger.error({ toolName }, 'Tool not found');
      throw new ToolNotFoundError(toolName);
    }

    if (matchingTools.length > 1) {
      logger.warn(
        {
          toolName,
          matches: matchingTools.map(([qualifiedName]) => qualifiedName),
        },
        'Multiple tools match unqualified name, using first match',
      );
    }

    return matchingTools[0][0]; // Return the first matching qualified name
  }

  /**
   * Gets a tool registry entry by name
   * @param toolName The tool name (can be qualified or unqualified)
   * @returns The tool registry entry or null if not found
   */
  getToolRegistryEntry(toolName: string): ToolRegistryEntry | null {
    try {
      const qualifiedName = this.resolveToolName(toolName);
      return this.toolRegistry.get(qualifiedName) || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Gets the tool description prompt for a server
   * @param serverId The server ID
   * @returns The tool description prompt or null if not found
   */
  getToolDescriptionPrompt(serverId: string): string | null {
    return this.toolDescriptionPrompts.get(serverId) || null;
  }

  /**
   * Gets all available tools
   * @returns An array of tool definitions
   */
  getAvailableTools(): ToolDefinition[] {
    return [...this.toolRegistry.values()].map((entry) => entry.definition);
  }

  /**
   * Gets all server tool description prompts
   * @returns A map of server IDs to tool description prompts
   */
  getAllToolDescriptionPrompts(): ServerToolDescriptionPrompts {
    return new Map(this.toolDescriptionPrompts);
  }

  /**
   * Validates tool arguments against the tool's JSON Schema
   * @param toolName The tool name (can be qualified or unqualified)
   * @param args The arguments to validate
   * @returns True if valid, or an object with errors if invalid
   * @throws {ToolNotFoundError} If the tool is not found
   */
  async validateToolArguments(
    toolName: string,
    args: Record<string, any>,
  ): Promise<boolean | { errors: any[] }> {
    const qualifiedName = this.resolveToolName(toolName);
    const toolEntry = this.toolRegistry.get(qualifiedName);

    if (!toolEntry) {
      throw new ToolNotFoundError(qualifiedName);
    }

    const schema = toolEntry.definition.parameters;

    // Skip validation if no schema is provided
    if (!schema) {
      return true;
    }

    // Compile the schema if needed
    const validate = this.ajv.compile(schema);
    const valid = validate(args);

    if (!valid) {
      return { errors: validate.errors || [] };
    }

    return true;
  }

  /**
   * Checks if the circuit breaker is open for a tool
   * @param toolName The tool name (can be qualified or unqualified)
   * @returns True if the circuit is open, false otherwise
   */
  isCircuitOpen(toolName: string): boolean {
    const entry = this.getToolRegistryEntry(toolName);
    if (!entry) {
      return false;
    }

    // Auto-reset circuit after cool-down period
    if (entry.reliability.circuitOpen && entry.reliability.lastFailure) {
      const timeSinceLastFailure = Date.now() - entry.reliability.lastFailure;
      if (timeSinceLastFailure > this.config.circuitResetTimeMs) {
        entry.reliability.circuitOpen = false;
        entry.reliability.failureCount = 0;
        logger.info(
          { toolName: entry.qualifiedName },
          'Circuit breaker auto-reset after cool-down period',
        );
      }
    }

    return entry.reliability.circuitOpen;
  }

  /**
   * Records a successful tool execution
   * @param toolName The tool name (can be qualified or unqualified)
   * @param executionTimeMs The execution time in milliseconds
   */
  recordToolSuccess(toolName: string, executionTimeMs: number): void {
    const entry = this.getToolRegistryEntry(toolName);
    if (!entry) {
      return;
    }

    // Update reliability - reduce failure count on success
    if (entry.reliability.failureCount > 0) {
      entry.reliability.failureCount--;
    }
    entry.reliability.successCount++;

    // Reset circuit breaker if it was open
    if (entry.reliability.circuitOpen) {
      entry.reliability.circuitOpen = false;
      logger.info(
        { toolName: entry.qualifiedName },
        'Circuit breaker closed after successful execution',
      );
    }

    // Update performance metrics
    entry.performance.callCount++;
    entry.performance.lastUsed = Date.now();

    // Exponential moving average for response time
    const alpha = 0.2; // Smoothing factor
    entry.performance.avgResponseTimeMs =
      alpha * executionTimeMs +
      (1 - alpha) * (entry.performance.avgResponseTimeMs || executionTimeMs);

    logger.debug(
      {
        toolName: entry.qualifiedName,
        executionTimeMs,
        avgResponseTimeMs: entry.performance.avgResponseTimeMs,
        successCount: entry.reliability.successCount,
      },
      'Recorded tool execution success',
    );
  }

  /**
   * Records a failed tool execution
   * @param toolName The tool name (can be qualified or unqualified)
   * @param error The error that occurred
   */
  recordToolFailure(toolName: string, error: Error): void {
    const entry = this.getToolRegistryEntry(toolName);
    if (!entry) {
      return;
    }

    // Update reliability metrics
    entry.reliability.failureCount++;
    entry.reliability.lastFailure = Date.now();

    // Check if circuit should open
    const shouldOpenCircuit = entry.reliability.failureCount >= this.config.circuitBreakerThreshold;

    if (shouldOpenCircuit && !entry.reliability.circuitOpen) {
      entry.reliability.circuitOpen = true;
      logger.warn(
        {
          toolName: entry.qualifiedName,
          failureCount: entry.reliability.failureCount,
          threshold: this.config.circuitBreakerThreshold,
        },
        'Circuit breaker opened due to consecutive failures',
      );
    }

    // Update performance metrics
    entry.performance.callCount++;
    entry.performance.lastUsed = Date.now();

    logger.debug(
      {
        toolName: entry.qualifiedName,
        failureCount: entry.reliability.failureCount,
        circuitOpen: entry.reliability.circuitOpen,
        error: error.message,
      },
      'Recorded tool execution failure',
    );
  }

  /**
   * Executes a tool
   * @param request The tool call request
   * @param options Execution options
   * @returns The tool call response
   * @throws {ToolNotFoundError} If the tool is not found
   * @throws {ToolValidationError} If the arguments are invalid
   * @throws {CircuitOpenError} If the circuit breaker is open
   * @throws {ToolExecutionError} If the tool execution fails
   */
  async executeTool(
    request: ToolCallRequest,
    options: ToolExecutionOptions = {},
  ): Promise<ToolCallResponse> {
    const startTime = Date.now();
    const qualifiedToolName = this.resolveToolName(request.toolName);

    logger.info(
      {
        toolName: qualifiedToolName,
        requestId: request.requestId,
      },
      'Executing tool',
    );

    const toolEntry = this.toolRegistry.get(qualifiedToolName);

    if (!toolEntry) {
      throw new ToolNotFoundError(qualifiedToolName);
    }

    // Check circuit breaker
    if (this.isCircuitOpen(qualifiedToolName)) {
      const error = new CircuitOpenError(
        qualifiedToolName,
        toolEntry.reliability.failureCount,
        toolEntry.reliability.lastFailure!,
      );
      logger.warn(
        {
          toolName: qualifiedToolName,
          failureCount: toolEntry.reliability.failureCount,
        },
        'Tool execution blocked by circuit breaker',
      );
      throw error;
    }

    // Validate arguments
    const validationResult = await this.validateToolArguments(qualifiedToolName, request.arguments);
    if (validationResult !== true) {
      const error = new ToolValidationError(qualifiedToolName, (validationResult as any).errors);
      logger.warn(
        {
          toolName: qualifiedToolName,
          errors: (validationResult as any).errors,
          arguments: request.arguments,
        },
        'Tool arguments validation failed',
      );
      throw error;
    }

    // Setup execution with timeout
    const abortController = new AbortController();
    const timeoutMs =
      request.timeoutMs || toolEntry.timeoutMs || options.timeoutMs || this.config.defaultTimeoutMs;

    const timeout = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    this.activeExecutions.set(request.requestId, { abortController, timeout });

    try {
      logger.debug(
        {
          toolName: qualifiedToolName,
          requestId: request.requestId,
          arguments: request.arguments,
          timeoutMs,
        },
        'Calling tool with arguments',
      );

      // Execute the tool
      const result = await toolEntry.client.callTool(toolEntry.definition.name, request.arguments, {
        signal: abortController.signal,
      });

      const executionTimeMs = Date.now() - startTime;

      // Record success
      this.recordToolSuccess(qualifiedToolName, executionTimeMs);

      logger.info(
        {
          toolName: qualifiedToolName,
          requestId: request.requestId,
          executionTimeMs,
        },
        'Tool execution completed successfully',
      );

      return {
        toolName: qualifiedToolName,
        result,
        requestId: request.requestId,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Record failure
      this.recordToolFailure(qualifiedToolName, error as Error);

      logger.error(
        {
          toolName: qualifiedToolName,
          requestId: request.requestId,
          error,
          executionTimeMs,
        },
        'Tool execution failed',
      );

      throw new ToolExecutionError(`Failed to execute tool: ${qualifiedToolName}`, error as Error, {
        toolName: qualifiedToolName,
        serverId: toolEntry.serverId,
        requestId: request.requestId,
        arguments: request.arguments,
      });
    } finally {
      clearTimeout(timeout);
      this.activeExecutions.delete(request.requestId);
    }
  }

  /**
   * Aborts a running tool execution
   * @param requestId The request ID
   * @returns True if aborted, false if not found
   */
  async abortToolExecution(requestId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(requestId);

    if (!execution) {
      return false;
    }

    clearTimeout(execution.timeout);
    execution.abortController.abort();
    this.activeExecutions.delete(requestId);

    logger.info({ requestId }, 'Aborted tool execution');

    return true;
  }

  /**
   * Shuts down the MCP Coordinator
   * Disconnects all clients and cleans up resources
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Coordinator');

    // Abort any active executions
    for (const [requestId, execution] of this.activeExecutions.entries()) {
      clearTimeout(execution.timeout);
      execution.abortController.abort();
      logger.debug({ requestId }, 'Aborted active execution during shutdown');
    }
    this.activeExecutions.clear();

    // Disconnect all clients
    for (const [serverId, client] of this.clients.entries()) {
      try {
        await client.disconnect();
        logger.debug({ serverId }, 'Disconnected MCP client');
      } catch (error) {
        logger.warn({ serverId, error }, 'Failed to disconnect MCP client');
      }
    }

    this.clients.clear();
    this.toolRegistry.clear();
    this.toolDescriptionPrompts.clear();

    logger.info('MCP Coordinator shutdown complete');
  }
}
