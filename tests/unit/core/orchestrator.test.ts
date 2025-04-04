// tests/unit/core/orchestrator.test.ts
// Unit tests for the Conversation Orchestrator

import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../../../src/core/llm';
import { MCPCoordinator } from '../../../src/core/mcp';
import { ConversationOrchestrator } from '../../../src/core/orchestrator';
import { SessionManager } from '../../../src/session';
import { ChatMessage, ServerMessage } from '../../../src/types';
import { ToolCallRequest, ToolCallResponse, ToolDefinition } from '../../../src/types/mcp';
import { LLMServiceError } from '../../../src/utils/errors';

// Mock the imports
jest.mock('uuid');
jest.mock('../../../src/core/llm');
jest.mock('../../../src/core/mcp');
jest.mock('../../../src/session');
jest.mock('../../../src/utils/logger');

// Mock UUID function to return predictable values
(uuidv4 as jest.Mock).mockImplementation(() => 'mock-uuid');

describe('ConversationOrchestrator', () => {
  let orchestrator: ConversationOrchestrator;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockMCPCoordinator: jest.Mocked<MCPCoordinator>;
  let mockSessionManager: jest.Mocked<SessionManager>;

  const sessionId = 'test-session-id';
  const mockToolDefinitions: ToolDefinition[] = [
    {
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockLLMService = {
      generateChatMessage: jest.fn(),
      initialize: jest.fn(),
      abortGeneration: jest.fn(),
      getTokenUsage: jest.fn(),
    } as unknown as jest.Mocked<LLMService>;

    mockMCPCoordinator = {
      getAvailableTools: jest.fn().mockReturnValue(mockToolDefinitions),
      getAllToolDescriptionPrompts: jest.fn().mockReturnValue(new Map()),
      executeTool: jest.fn(),
      abortToolExecution: jest.fn(),
    } as unknown as jest.Mocked<MCPCoordinator>;

    mockSessionManager = {
      getHistory: jest.fn().mockReturnValue([]),
      addMessageToHistory: jest.fn(),
      getSession: jest.fn().mockReturnValue({
        id: sessionId,
        history: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        connectionId: 'test-connection',
        metadata: {},
      }),
    } as unknown as jest.Mocked<SessionManager>;

    // Create the orchestrator with mocked dependencies
    orchestrator = new ConversationOrchestrator(
      mockLLMService,
      mockMCPCoordinator,
      mockSessionManager,
      {
        maxHistoryLength: 10,
        retryAttempts: 2,
        retryDelay: 100,
        maxTokenCount: 1000,
      },
    );
  });

  afterEach(() => {
    // Clean up any lingering mock generators
    jest.useRealTimers();
  });

  describe('handleInput', () => {
    it('should process user input and yield text responses', async () => {
      // Setup the LLM mock to return a text response
      mockLLMService.generateChatMessage.mockImplementation(async function* () {
        yield {
          id: 'response-id',
          role: 'assistant',
          content: 'This is a test response',
          createdAt: Date.now(),
        };
      });

      // Call the handler and collect results
      const userInput = 'Hello, world!';
      const results: ServerMessage[] = [];

      for await (const message of orchestrator.handleInput(sessionId, userInput)) {
        results.push(message);
      }

      // Verify the user message was added to history
      expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          role: 'user',
          content: userInput,
        }),
      );

      // Verify the LLM was called with the right parameters
      expect(mockLLMService.generateChatMessage).toHaveBeenCalledWith(
        expect.any(Array),
        mockToolDefinitions,
        expect.any(Map),
        expect.objectContaining({
          requestId: expect.any(String),
        }),
      );

      // Verify the response message was added to history
      expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          role: 'assistant',
          content: 'This is a test response',
        }),
      );

      // Verify the correct messages were yielded
      expect(results).toEqual([
        {
          type: 'text',
          payload: {
            content: 'This is a test response',
          },
        },
        { type: 'end' },
      ]);
    });

    it('should handle tool calls and yield status updates', async () => {
      // Setup the initial LLM mock to return a tool call, and the second call to return a text response
      mockLLMService.generateChatMessage
        .mockImplementationOnce(async function* () {
          yield {
            id: 'tool-call-id',
            role: 'assistant',
            toolName: 'test_tool',
            data: { arguments: { query: 'test query' } },
            createdAt: Date.now(),
          };
        })
        .mockImplementationOnce(async function* () {
          yield {
            id: 'follow-up-id',
            role: 'assistant',
            content: 'This is a follow-up response',
            createdAt: Date.now(),
          };
        });

      // Setup the MCP mock to return a tool response
      mockMCPCoordinator.executeTool.mockResolvedValue({
        toolName: 'test_tool',
        result: { data: 'test result' },
        requestId: 'test-request-id',
        executionTimeMs: 100,
      } as ToolCallResponse);

      // Call the handler and collect results
      const userInput = 'Use the test tool';
      const results: ServerMessage[] = [];

      for await (const message of orchestrator.handleInput(sessionId, userInput)) {
        results.push(message);
      }

      // Verify the tool was executed with the right parameters
      expect(mockMCPCoordinator.executeTool).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'test_tool',
          arguments: { query: 'test query' },
        } as Partial<ToolCallRequest>),
      );

      // Verify the status messages were yielded
      expect(results).toContainEqual({
        type: 'status',
        payload: {
          state: 'processing',
          tool: 'test_tool',
          message: expect.stringContaining('test_tool'),
        },
      });

      expect(results).toContainEqual({
        type: 'status',
        payload: {
          state: 'complete',
          tool: 'test_tool',
          message: expect.stringContaining('test_tool'),
          data: { data: 'test result' },
        },
      });

      // Verify the tool result was added to history
      expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          role: 'tool',
          toolName: 'test_tool',
          data: { data: 'test result' },
        }),
      );

      // Verify the follow-up response was yielded
      expect(results).toContainEqual({
        type: 'text',
        payload: {
          content: 'This is a follow-up response',
        },
      });

      // Verify the end signal was sent
      expect(results[results.length - 1]).toEqual({ type: 'end' });
    });

    it('should limit nested tool call depth', async () => {
      // Setup the initial LLM call to return a tool call
      mockLLMService.generateChatMessage.mockImplementationOnce(async function* () {
        yield {
          id: 'tool-call-1',
          role: 'assistant',
          toolName: 'test_tool',
          data: { arguments: { query: 'level 1' } },
          createdAt: Date.now(),
        };
      });

      // Mock 4 levels of nested tool calls (exceeding the MAX_TOOL_CALL_DEPTH of 3)
      for (let i = 0; i < 4; i++) {
        // Each follow-up returns another tool call
        mockLLMService.generateChatMessage.mockImplementationOnce(async function* () {
          yield {
            id: `tool-call-${i + 2}`,
            role: 'assistant',
            toolName: 'test_tool',
            data: { arguments: { query: `level ${i + 2}` } },
            createdAt: Date.now(),
          };
        });
      }

      // Setup the MCP mock to return tool responses
      mockMCPCoordinator.executeTool.mockResolvedValue({
        toolName: 'test_tool',
        result: { data: 'test result' },
        requestId: 'test-request-id',
        executionTimeMs: 100,
      } as ToolCallResponse);

      // Call the handler and collect results
      const userInput = 'Use the test tool';
      const results: ServerMessage[] = [];

      for await (const message of orchestrator.handleInput(sessionId, userInput)) {
        results.push(message);
      }

      // Verify we get a depth exceeded message
      const depthExceededMessage = results.find(
        (msg) =>
          msg.type === 'text' &&
          msg.payload.content.includes('maximum number of nested tool calls'),
      );
      expect(depthExceededMessage).toBeDefined();

      // Verify we added a system message about max depth
      expect(mockSessionManager.addMessageToHistory).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('maximum number of nested tool calls'),
          metadata: expect.objectContaining({ maxDepthExceeded: true }),
        }),
      );

      // Verify we executed the tool calls up to the max depth
      expect(mockMCPCoordinator.executeTool).toHaveBeenCalledTimes(3);
    });

    it('should retry LLM generation on error', async () => {
      // Setup the LLM mock to fail once, then succeed
      mockLLMService.generateChatMessage
        .mockImplementationOnce(async function* () {
          throw new LLMServiceError('Test LLM error', new Error('API failure'), {
            model: 'test-model',
            attemptCount: 1,
          });
        })
        .mockImplementation(async function* () {
          yield {
            id: 'retry-response-id',
            role: 'assistant',
            content: 'Response after retry',
            createdAt: Date.now(),
          };
        });

      // Call the handler and collect results
      const userInput = 'Generate an error then retry';
      const results: ServerMessage[] = [];

      for await (const message of orchestrator.handleInput(sessionId, userInput)) {
        results.push(message);
      }

      // Verify the LLM was called twice
      expect(mockLLMService.generateChatMessage).toHaveBeenCalledTimes(2);

      // Verify the response after retry was yielded
      expect(results).toContainEqual({
        type: 'text',
        payload: {
          content: 'Response after retry',
        },
      });

      // Verify the end signal was sent
      expect(results[results.length - 1]).toEqual({ type: 'end' });
    });

    it('should handle tool execution errors gracefully', async () => {
      // Setup the LLM mock to return a tool call
      mockLLMService.generateChatMessage.mockImplementationOnce(async function* () {
        yield {
          id: 'tool-call-id',
          role: 'assistant',
          toolName: 'test_tool',
          data: { arguments: { query: 'test query' } },
          createdAt: Date.now(),
        };
      });

      // Setup tool to throw an error
      mockMCPCoordinator.executeTool.mockRejectedValue(new Error('Tool execution failed'));

      // Setup recovery response
      mockLLMService.generateChatMessage.mockImplementationOnce(async function* () {
        yield {
          id: 'recovery-id',
          role: 'assistant',
          content: 'Let me try something else instead',
          createdAt: Date.now(),
        };
      });

      // Call the handler and collect results
      const userInput = 'Use the failing tool';
      const results: ServerMessage[] = [];

      for await (const message of orchestrator.handleInput(sessionId, userInput)) {
        results.push(message);
      }

      // Verify we get an error status message
      expect(results).toContainEqual(
        expect.objectContaining({
          type: 'status',
          payload: expect.objectContaining({
            state: 'complete',
            tool: 'test_tool',
            data: expect.objectContaining({
              error: expect.stringContaining('Tool execution failed'),
            }),
          }),
        }),
      );

      // Verify we get a recovery response
      expect(results).toContainEqual({
        type: 'text',
        payload: {
          content: 'Let me try something else instead',
        },
      });
    });
  });

  describe('pruneHistory', () => {
    it('should truncate history when it exceeds max length', () => {
      // Create a long history
      const longHistory: ChatMessage[] = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `msg-${i}`,
          role: i === 0 ? 'user' : i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          createdAt: Date.now() - (20 - i) * 1000,
        }));

      // Setup the session manager to return the long history
      mockSessionManager.getHistory.mockReturnValue(longHistory);

      // Mock the session manager to return a truncated history after updateHistory is called
      mockSessionManager.getHistory.mockImplementation(() => {
        // The first call returns the long history
        if (mockSessionManager.getHistory.mock.calls.length === 1) {
          return longHistory;
        }

        // Subsequent calls should return the truncated history with a system message
        const truncatedHistory = longHistory.slice(-5);
        return [
          {
            id: 'mock-uuid',
            role: 'system',
            content: 'Some earlier messages have been removed to manage conversation length.',
            createdAt: expect.any(Number),
            metadata: { truncatedMessages: 15 },
          },
          ...truncatedHistory,
        ];
      });

      // Call pruneHistory
      const result = orchestrator.pruneHistory(sessionId, {
        maxTokenCount: 1000,
        retainNewestMessages: 5,
      });

      // Verify the result contains a system message about truncation
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('removed');

      // Verify the history was replaced with the truncated version
      expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('abortActiveToolExecution', () => {
    it('should abort active requests and clean up resources', async () => {
      // Setup active request in the orchestrator
      const requestId = 'test-request-id';
      const abortController = new AbortController();
      const timeouts: NodeJS.Timeout[] = [setTimeout(() => {}, 1000), setTimeout(() => {}, 2000)];

      // Access private field via any type casting
      (orchestrator as any).activeRequests.set(requestId, {
        abortController,
        timeouts,
      });

      const result = await orchestrator.abortActiveToolExecution(sessionId, requestId);

      // Verify abort was called and request was removed
      expect(result).toBe(true);
      expect(abortController.signal.aborted).toBe(true);
      expect((orchestrator as any).activeRequests.has(requestId)).toBe(false);

      // Clean up the timeouts we created
      for (const timeout of timeouts) {
        clearTimeout(timeout);
      }
    });

    it('should return false if request not found', async () => {
      const result = await orchestrator.abortActiveToolExecution(sessionId, 'non-existent-id');
      expect(result).toBe(false);
    });
  });
});
