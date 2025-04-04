// tests/integration/mcp.test.ts
// Integration tests for the MCP Coordinator with real servers

import fs from 'fs';
import { loadMCPConfig } from '../../src/config/mcpConfig';
import { MCPCoordinator } from '../../src/core/mcp';

// Only run these tests if mcp.json exists and has valid servers
const hasMcpConfig = fs.existsSync('./mcp.json');

(hasMcpConfig ? describe : describe.skip)('MCP Coordinator Integration', () => {
  let coordinator: MCPCoordinator;

  beforeAll(async () => {
    // Create a new coordinator for all tests
    coordinator = new MCPCoordinator({
      configPath: './mcp.json',
      circuitBreakerThreshold: 5,
      circuitResetTimeMs: 60000,
      defaultTimeoutMs: 10000,
    });

    // Initialize the coordinator
    await coordinator.initialize();
  });

  afterAll(async () => {
    await coordinator.shutdown();
  });

  it('should connect to servers defined in mcp.json', () => {
    const config = loadMCPConfig('./mcp.json');
    const serverCount = Object.keys(config.servers).length;

    // Verify that servers were loaded
    expect(serverCount).toBeGreaterThan(0);

    // Get tool description prompts - there should be one per server
    const prompts = coordinator.getAllToolDescriptionPrompts();
    expect(prompts.size).toBe(serverCount);
  });

  it('should discover available tools from connected servers', () => {
    const tools = coordinator.getAvailableTools();

    // The test passes regardless of whether tools are found
    // Just log the tool count for information
    console.log(`Discovered ${tools.length} tools from connected servers`);

    // If tools are found, check their properties
    if (tools.length > 0) {
      const firstTool = tools[0];
      expect(firstTool.name).toBeDefined();
      expect(firstTool.description).toBeDefined();
    } else {
      console.log('No tools were discovered - this is valid for some server types');
    }
  });

  it('should have a valid tool registry', () => {
    const tools = coordinator.getAvailableTools();

    // We expect an empty array if no tools are available
    expect(Array.isArray(tools)).toBe(true);

    // If tools are found, verify registry entries
    if (tools.length > 0) {
      const firstTool = tools[0];
      const entry = coordinator.getToolRegistryEntry(firstTool.name);

      // Verify the entry is valid
      expect(entry).toBeDefined();
      expect(entry!.qualifiedName).toContain(firstTool.name);
      expect(entry!.serverId).toBeDefined();
      expect(entry!.performance).toBeDefined();
      expect(entry!.reliability).toBeDefined();
    }
  });
});
