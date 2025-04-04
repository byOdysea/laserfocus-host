# MCP Coordinator

This directory contains the implementation of the Model Context Protocol (MCP) Coordinator, which is a core component of the LaserFocus Host Server. The MCP Coordinator is responsible for managing connections to MCP servers, discovering tools, retrieving server-specific tool usage guidance prompts, and handling tool execution requests.

## Files

- `MCPCoordinator.ts` - Main implementation of the MCP Coordinator class
- `utils/generateFallbackPrompt.ts` - Utility for generating fallback tool descriptions
- `index.ts` - Entry point for exporting the MCP Coordinator

## Key Features

- **Server Management**: Connects to and manages multiple MCP servers defined in the configuration.
- **Tool Discovery**: Automatically discovers tools provided by connected MCP servers.
- **Prompt Management**: Retrieves or generates tool usage guidance prompts for LLMs.
- **Tool Execution**: Validates and executes tool calls, handling errors appropriately.
- **Circuit Breaker**: Implements a circuit breaker pattern to prevent cascading failures.
- **Performance Tracking**: Monitors and tracks tool execution performance.

## Usage

```typescript
import { MCPCoordinator } from './core/mcp';

// Create a new coordinator
const coordinator = new MCPCoordinator({
  configPath: './mcp.json', // Path to MCP configuration
  circuitBreakerThreshold: 5, // Number of failures before opening circuit
  circuitResetTimeMs: 60000, // Time before resetting circuit (1 min)
  defaultTimeoutMs: 10000, // Default tool execution timeout (10 sec)
});

// Initialize the coordinator
await coordinator.initialize();

// Execute a tool
const response = await coordinator.executeTool({
  toolName: 'server_id:tool_name', // Can be qualified or unqualified
  arguments: { key: 'value' }, // Tool arguments
  requestId: 'req-123', // Unique request ID
});

// Get available tools
const tools = coordinator.getAvailableTools();

// Get tool description prompts for LLMs
const prompts = coordinator.getAllToolDescriptionPrompts();

// Shutdown the coordinator
await coordinator.shutdown();
```

## Configuration

The MCP Coordinator is configured using a JSON file (default: `mcp.json`) that defines the MCP servers to connect to. Example configuration:

```json
{
  "servers": {
    "memory": {
      "id": "memory",
      "name": "Simple Memory Server",
      "description": "Provides basic key-value storage using a local file",
      "type": "local",
      "transport": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "./memory.json"
      }
    },
    "remote_server": {
      "id": "remote_server",
      "name": "Remote API Server",
      "description": "Provides access to remote APIs",
      "type": "remote",
      "transport": "http",
      "url": "http://example.com/mcp"
    }
  }
}
```
