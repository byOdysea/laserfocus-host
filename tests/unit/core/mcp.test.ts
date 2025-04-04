// tests/unit/core/mcp.test.ts
// Tests for the MCP Coordinator

import { Client } from '@modelcontextprotocol/sdk';
import { MCPCoordinator } from '../../../src/core/mcp';
import {
  CircuitOpenError,
  ToolNotFoundError,
  ToolValidationError,
} from '../../../src/utils/errors';

// Mock the MCP SDK Client
jest.mock('@modelcontextprotocol/sdk', () => {
  return {
    Client: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'The search query',
                  },
                },
                required: ['query'],
              },
            },
          ],
        }),
        getPrompt: jest.fn().mockRejectedValue(new Error('Not implemented')),
        callTool: jest
          .fn()
          .mockImplementation((toolName: string, args: Record<string, any>, _options?: any) => {
            if (toolName === 'failing_tool') {
              return Promise.reject(new Error('Tool execution failed'));
            }
            return Promise.resolve({ success: true, args });
          }),
      };
    }),
  };
});

// Mock the config loader
jest.mock('../../../src/config/mcpConfig', () => {
  return {
    loadMCPConfig: jest.fn().mockReturnValue({
      servers: {
        test_server: {
          id: 'test_server',
          type: 'local',
          transport: 'stdio',
          command: 'test-command',
          args: [],
        },
        other_server: {
          id: 'other_server',
          type: 'remote',
          transport: 'http',
          url: 'http://example.com',
        },
      },
    }),
  };
});

describe('MCPCoordinator', () => {
  let coordinator: MCPCoordinator;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a new coordinator for each test
    coordinator = new MCPCoordinator({
      configPath: './mcp.test.json',
      circuitBreakerThreshold: 2,
      circuitResetTimeMs: 1000,
      defaultTimeoutMs: 1000,
    });

    // Initialize the coordinator
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.shutdown();
  });

  describe('initialization', () => {
    it('should initialize with the correct configuration', () => {
      expect(coordinator).toBeDefined();
      expect(Client).toHaveBeenCalledTimes(2);
    });

    it('should generate fallback tool descriptions when prompts are not available', () => {
      const prompt = coordinator.getToolDescriptionPrompt('test_server');
      expect(prompt).toBeDefined();
      expect(prompt).toContain('When using tools from the "test_server" server');
      expect(prompt).toContain('test_tool');
    });
  });

  describe('tool registry', () => {
    it('should register tools with qualified names', () => {
      const tools = coordinator.getAvailableTools();
      expect(tools).toHaveLength(2); // One tool per server
      expect(tools[0].name).toBe('test_tool');
    });

    it('should resolve unqualified names to qualified names', () => {
      const qualifiedName = coordinator.resolveToolName('test_tool');
      expect(qualifiedName).toBe('test_server:test_tool');

      // When already qualified, should return as is
      const alreadyQualified = coordinator.resolveToolName('test_server:test_tool');
      expect(alreadyQualified).toBe('test_server:test_tool');
    });

    it('should throw when resolving a non-existent tool', () => {
      expect(() => coordinator.resolveToolName('non_existent_tool')).toThrow(ToolNotFoundError);
    });
  });

  describe('tool execution', () => {
    it('should execute a tool successfully', async () => {
      const response = await coordinator.executeTool({
        toolName: 'test_tool',
        arguments: { query: 'test query' },
        requestId: 'test-request-1',
      });

      expect(response).toBeDefined();
      expect(response.toolName).toBe('test_server:test_tool');
      expect(response.result).toEqual({ success: true, args: { query: 'test query' } });
    });

    it('should validate tool arguments', async () => {
      await expect(
        coordinator.executeTool({
          toolName: 'test_tool',
          arguments: {}, // Missing required 'query' parameter
          requestId: 'test-request-2',
        }),
      ).rejects.toThrow(ToolValidationError);
    });

    it('should track tool performance metrics', async () => {
      await coordinator.executeTool({
        toolName: 'test_tool',
        arguments: { query: 'test query' },
        requestId: 'test-request-3',
      });

      const toolEntry = coordinator.getToolRegistryEntry('test_tool');
      expect(toolEntry).toBeDefined();
      expect(toolEntry!.performance.callCount).toBe(1);
      expect(toolEntry!.performance.avgResponseTimeMs).toBeGreaterThan(0);
    });
  });

  describe('circuit breaker', () => {
    beforeEach(() => {
      // Mock a failing tool
      const mockClient = (Client as jest.Mock).mock.results[0].value;
      mockClient.callTool.mockImplementation((toolName: string, args: Record<string, any>) => {
        if (toolName === 'test_tool' && args.fail) {
          return Promise.reject(new Error('Tool execution failed'));
        }
        return Promise.resolve({ success: true, args });
      });
    });

    it('should open the circuit after multiple failures', async () => {
      // First failure
      await expect(
        coordinator.executeTool({
          toolName: 'test_tool',
          arguments: { query: 'test query', fail: true },
          requestId: 'circuit-test-1',
        }),
      ).rejects.toThrow();

      let toolEntry = coordinator.getToolRegistryEntry('test_tool');
      expect(toolEntry!.reliability.failureCount).toBe(1);
      expect(toolEntry!.reliability.circuitOpen).toBe(false);

      // Second failure - should open circuit
      await expect(
        coordinator.executeTool({
          toolName: 'test_tool',
          arguments: { query: 'test query', fail: true },
          requestId: 'circuit-test-2',
        }),
      ).rejects.toThrow();

      toolEntry = coordinator.getToolRegistryEntry('test_tool');
      expect(toolEntry!.reliability.failureCount).toBe(2);
      expect(toolEntry!.reliability.circuitOpen).toBe(true);

      // Third attempt - should fail fast with CircuitOpenError
      await expect(
        coordinator.executeTool({
          toolName: 'test_tool',
          arguments: { query: 'test query' },
          requestId: 'circuit-test-3',
        }),
      ).rejects.toThrow(CircuitOpenError);
    });

    it('should reduce failure count on success', async () => {
      // One failure
      await expect(
        coordinator.executeTool({
          toolName: 'test_tool',
          arguments: { query: 'test query', fail: true },
          requestId: 'heal-test-1',
        }),
      ).rejects.toThrow();

      let toolEntry = coordinator.getToolRegistryEntry('test_tool');
      expect(toolEntry!.reliability.failureCount).toBe(1);

      // Success should decrease failure count
      await coordinator.executeTool({
        toolName: 'test_tool',
        arguments: { query: 'test query', fail: false },
        requestId: 'heal-test-2',
      });

      toolEntry = coordinator.getToolRegistryEntry('test_tool');
      expect(toolEntry!.reliability.failureCount).toBe(0);
    });
  });

  describe('abort functionality', () => {
    // Create references for cleanup
    let mockTimeouts: NodeJS.Timeout[] = [];

    beforeEach(() => {
      // Store setTimeout references
      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((callback, ms, ...args) => {
        const timeout = originalSetTimeout(callback, ms, ...args);
        mockTimeouts.push(timeout);
        return timeout;
      });
    });

    afterEach(() => {
      // Clean up any remaining timeouts
      mockTimeouts.forEach((timeout) => clearTimeout(timeout));
      mockTimeouts = [];
      jest.restoreAllMocks();
    });

    it('should abort a running tool execution', async () => {
      // Setup a tool execution that can be aborted
      const mockClient = (Client as jest.Mock).mock.results[0].value;
      const originalCallTool = mockClient.callTool;

      // Mock a request ID that will be tracked in the coordinator
      const requestId = 'abort-test-1';
      let wasAborted = false;

      // Create a long-running promise that can be aborted
      mockClient.callTool.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          // Store a reference to check if it's aborted later
          const abortController = new AbortController();

          // Reject when aborted
          abortController.signal.addEventListener('abort', () => {
            wasAborted = true;
            reject(new Error('Aborted'));
          });

          // Manually expose the abort controller to the coordinator
          // This simulates the client's behavior
          const timeoutId = setTimeout(() => resolve({ success: true }), 200);
          mockTimeouts.push(timeoutId);

          // Set the abort controller in the execution record
          // This is a hack for testing - need to know the function name
          const executions = (coordinator as any).activeExecutions;
          executions.set(requestId, {
            abortController,
            timeout: timeoutId,
          });
        });
      });

      // Start execution
      const executionPromise = coordinator.executeTool({
        toolName: 'test_tool',
        arguments: { query: 'test query' },
        requestId,
      });

      // Pause to allow the execution to be tracked
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Abort it
      const aborted = await coordinator.abortToolExecution(requestId);
      expect(aborted).toBe(true);

      // Verify the execution was actually aborted
      await expect(executionPromise).rejects.toThrow();
      expect(wasAborted).toBe(true);

      // Restore the mock
      mockClient.callTool = originalCallTool;
    }, 1000); // Add timeout to ensure test doesn't hang
  });
});
