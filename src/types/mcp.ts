// src/types/mcp.ts
// MCP-related type definitions

/**
 * Configuration for an MCP server from mcp.json
 */
export interface ServerConfig {
  id: string;
  type: 'local' | 'remote';
  transport: 'stdio' | 'http';
  command?: string; // For stdio transport
  args?: string[]; // For stdio transport
  url?: string; // For http transport
  timeoutMs?: number; // Tool execution timeout
}

/**
 * Tool call request
 */
export interface ToolCallRequest {
  toolName: string; // Can be qualified (server:tool) or unqualified
  arguments: Record<string, any>;
  requestId: string;
  timeoutMs?: number; // Per-call timeout
}

/**
 * Tool call response
 */
export interface ToolCallResponse {
  toolName: string;
  result: any;
  error?: {
    code: number;
    message: string;
  };
  requestId: string;
  executionTimeMs: number; // How long the call took
}

/**
 * Tool definition from the MCP server
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema for validation
  examples?: Record<string, any>[]; // Example valid arguments
}

/**
 * Stored content from server "tool-descriptions" prompts
 */
export type ServerToolDescriptionPrompts = Map<string, string>; // Map<serverId, promptText>

/**
 * Comprehensive tool registry entry
 */
export interface ToolRegistryEntry {
  // Core definition
  qualifiedName: string; // Format: "{serverId}:{toolName}"
  definition: ToolDefinition;

  // Server info
  serverId: string;
  client: any; // The MCP Client instance
  transportType: 'stdio' | 'http';
  timeoutMs?: number; // Tool-specific timeout

  // Reliability metrics
  reliability: {
    successCount: number;
    failureCount: number;
    lastFailure?: number;
    circuitOpen: boolean;
  };

  // Performance metrics
  performance: {
    avgResponseTimeMs: number;
    callCount: number;
    lastUsed: number;
  };
}

/**
 * Request options for tool execution
 */
export interface ToolExecutionOptions {
  timeoutMs?: number;
  priority?: 'high' | 'normal' | 'low';
  retryOptions?: {
    maxRetries: number;
    delayMs: number;
    retryableErrorCodes: number[];
  };
  abortSignal?: AbortSignal;
}

/**
 * Configuration options for MCP Coordinator
 */
export interface MCPCoordinatorConfig {
  configPath: string; // Path to mcp.json
  circuitBreakerThreshold: number;
  circuitResetTimeMs: number;
  defaultTimeoutMs: number;
}
