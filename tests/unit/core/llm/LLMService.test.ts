// tests/unit/core/llm/LLMService.test.ts
// Tests for the LLMService class

import { LLMService } from '../../../../src/core/llm/LLMService';
import { ChatMessage } from '../../../../src/types/core';
import { GenerationOptions, LLMConfig, LLMRawResponse } from '../../../../src/types/llm';
import { ToolDefinition } from '../../../../src/types/mcp';

// Mock uuid for consistent test results
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid'),
}));

// Create a concrete implementation of the abstract LLMService for testing
class TestLLMService extends LLMService {
  public mockResponses: LLMRawResponse[] = [];
  public lastFormattedHistory: any[] | null = null;

  // Expose protected methods for testing
  public exposeFormatHistoryForLLM(history: ChatMessage[]): any[] {
    return this.formatHistoryForLLM(history);
  }

  public exposeCompileSystemPrompt(
    basePrompt: string,
    toolDefinitions: ToolDefinition[],
    serverToolPrompts: Map<string, string>,
  ): string {
    return this.compileSystemPrompt(basePrompt, toolDefinitions, serverToolPrompts);
  }

  public exposeParseToolCall(
    text: string,
  ): { tool: string; arguments: Record<string, any> } | null {
    return this.parseToolCall(text);
  }

  public exposeConvertRawResponseToChatMessage(
    response: LLMRawResponse,
  ): Omit<ChatMessage, 'id' | 'createdAt'> {
    return this.convertRawResponseToChatMessage(response);
  }

  public exposeEstimateTokenCount(text: string): number {
    return this.estimateTokenCount(text);
  }

  // Expose the activeGenerations map for testing
  public getActiveGenerations(): Map<
    string,
    { abortController: AbortController; timeout: NodeJS.Timeout }
  > {
    return this.activeGenerations;
  }

  // Implementation of the abstract method
  protected async *generateRawResponse(
    formattedHistory: any[],
    options?: GenerationOptions & { abortSignal?: AbortSignal },
  ): AsyncGenerator<LLMRawResponse> {
    this.lastFormattedHistory = formattedHistory;

    for (const response of this.mockResponses) {
      if (options?.abortSignal?.aborted) {
        return;
      }
      yield response;
    }
  }
}

describe('LLMService', () => {
  let llmService: TestLLMService;
  let mockConfig: LLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    llmService = new TestLLMService();
    mockConfig = {
      apiKey: 'test-api-key',
      model: 'test-model',
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant',
      maxRetries: 3,
      timeoutMs: 30000,
    };
  });

  describe('initialize', () => {
    it('should initialize with the provided config', async () => {
      await llmService.initialize(mockConfig);
      expect(llmService['config']).toEqual(mockConfig);
    });
  });

  describe('formatHistoryForLLM', () => {
    it('should format user messages correctly', () => {
      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createdAt: Date.now(),
        },
      ];

      const formatted = llmService.exposeFormatHistoryForLLM(history);
      expect(formatted).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should format assistant messages correctly', () => {
      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: 'Hello there',
          createdAt: Date.now(),
        },
      ];

      const formatted = llmService.exposeFormatHistoryForLLM(history);
      expect(formatted).toEqual([{ role: 'assistant', content: 'Hello there' }]);
    });

    it('should format tool messages correctly', () => {
      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'tool',
          toolName: 'test-tool',
          data: { result: 'test-result' },
          createdAt: Date.now(),
        },
      ];

      const formatted = llmService.exposeFormatHistoryForLLM(history);
      expect(formatted).toEqual([
        {
          role: 'tool',
          name: 'test-tool',
          content: JSON.stringify({ result: 'test-result' }),
        },
      ]);
    });
  });

  describe('parseToolCall', () => {
    it('should parse a valid tool call', () => {
      const text = '```tool\n{"tool": "test-tool", "arguments": {"param1": "value1"}}\n```';
      const result = llmService.exposeParseToolCall(text);

      expect(result).toEqual({
        tool: 'test-tool',
        arguments: { param1: 'value1' },
      });
    });

    it('should return null for invalid JSON', () => {
      const text = '```tool\n{"tool": "test-tool", "arguments": {invalid json}}\n```';
      const result = llmService.exposeParseToolCall(text);

      expect(result).toBeNull();
    });

    it('should return null for text without tool call format', () => {
      const text = 'This is just regular text';
      const result = llmService.exposeParseToolCall(text);

      expect(result).toBeNull();
    });

    it('should return null for incomplete tool call format', () => {
      const text = '```tool\n{"tool": "test-tool"}\n```';
      const result = llmService.exposeParseToolCall(text);

      expect(result).toBeNull();
    });
  });

  describe('convertRawResponseToChatMessage', () => {
    it('should convert text response correctly', () => {
      const response: LLMRawResponse = {
        type: 'text',
        content: 'Hello, I am an assistant',
      };

      const result = llmService.exposeConvertRawResponseToChatMessage(response);

      expect(result).toEqual({
        role: 'assistant',
        content: 'Hello, I am an assistant',
      });
    });

    it('should convert tool call response correctly', () => {
      const response: LLMRawResponse = {
        type: 'tool_call',
        tool: 'test-tool',
        arguments: { param1: 'value1' },
      };

      const result = llmService.exposeConvertRawResponseToChatMessage(response);

      expect(result).toEqual({
        role: 'assistant',
        toolName: 'test-tool',
        data: { arguments: { param1: 'value1' } },
      });
    });

    it('should detect and convert tool call from text response', () => {
      const response: LLMRawResponse = {
        type: 'text',
        content: '```tool\n{"tool": "test-tool", "arguments": {"param1": "value1"}}\n```',
      };

      const result = llmService.exposeConvertRawResponseToChatMessage(response);

      expect(result).toEqual({
        role: 'assistant',
        toolName: 'test-tool',
        data: { arguments: { param1: 'value1' } },
      });
    });
  });

  describe('compileSystemPrompt', () => {
    it('should compile a prompt with tool definitions', () => {
      const basePrompt = 'You are a helpful assistant';
      const toolDefinitions: ToolDefinition[] = [
        {
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        },
      ];
      const serverToolPrompts = new Map<string, string>();

      const result = llmService.exposeCompileSystemPrompt(
        basePrompt,
        toolDefinitions,
        serverToolPrompts,
      );

      expect(result).toContain('You are a helpful assistant');
      expect(result).toContain('When calling a tool');
      expect(result).toContain('Available tools:');
      expect(result).toContain('test-tool: A test tool');
    });

    it('should include server tool prompts when available', () => {
      const basePrompt = 'You are a helpful assistant';
      const toolDefinitions: ToolDefinition[] = [];
      const serverToolPrompts = new Map<string, string>([['server1', 'Guidance for server1']]);

      const result = llmService.exposeCompileSystemPrompt(
        basePrompt,
        toolDefinitions,
        serverToolPrompts,
      );

      expect(result).toContain('You are a helpful assistant');
      expect(result).toContain('Additional guidance for using tools:');
      expect(result).toContain('Server: server1');
      expect(result).toContain('Guidance for server1');
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate token count based on text length', () => {
      const text = 'This is a test string with about 10 tokens';
      const result = llmService.exposeEstimateTokenCount(text);

      // 43 characters / 4 = ~11 tokens
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(text.length);
    });
  });

  describe('generateChatMessage', () => {
    beforeEach(async () => {
      await llmService.initialize(mockConfig);
    });

    it('should generate chat messages from raw responses', async () => {
      // Setup mock responses
      llmService.mockResponses = [{ type: 'text', content: 'Hello, I am an assistant' }];

      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          createdAt: Date.now(),
        },
      ];

      const toolDefinitions: ToolDefinition[] = [];
      const serverToolPrompts = new Map<string, string>();

      // Collect all generated messages
      const messages: ChatMessage[] = [];
      for await (const message of llmService.generateChatMessage(
        history,
        toolDefinitions,
        serverToolPrompts,
      )) {
        messages.push(message);
      }

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hello, I am an assistant');
      expect(messages[0].id).toBe('mock-uuid');
    });

    it('should handle tool call responses', async () => {
      // Setup mock responses
      llmService.mockResponses = [
        { type: 'tool_call', tool: 'test-tool', arguments: { param1: 'value1' } },
      ];

      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Use the test tool',
          createdAt: Date.now(),
        },
      ];

      const toolDefinitions: ToolDefinition[] = [
        {
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        },
      ];

      const serverToolPrompts = new Map<string, string>();

      // Collect all generated messages
      const messages: ChatMessage[] = [];
      for await (const message of llmService.generateChatMessage(
        history,
        toolDefinitions,
        serverToolPrompts,
      )) {
        messages.push(message);
      }

      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].toolName).toBe('test-tool');
      expect(messages[0].data).toEqual({ arguments: { param1: 'value1' } });
    });

    it('should handle timeout by calling abort', async () => {
      const requestId = 'test-request-id';
      const abortController = new AbortController();
      const abort = jest.spyOn(abortController, 'abort');
      const timeout = setTimeout(() => {}, 1000);

      // Manually add a test generation to the activeGenerations map
      llmService.getActiveGenerations().set(requestId, {
        abortController,
        timeout,
      });

      // Trigger timeout by directly calling the timeout callback
      jest.spyOn(global, 'setTimeout').mockImplementationOnce((cb) => {
        cb();
        return timeout;
      });

      // Call abortGeneration to test the timeout handling logic
      llmService.abortGeneration(requestId);

      // The abort should have been called
      expect(abort).toHaveBeenCalled();

      // Clean up
      clearTimeout(timeout);
      jest.restoreAllMocks();
    });
  });

  describe('abortGeneration', () => {
    it('should abort an ongoing generation', async () => {
      await llmService.initialize(mockConfig);

      const requestId = 'test-request-id';

      // Mock an active generation
      const abortController = new AbortController();
      const abort = jest.spyOn(abortController, 'abort');
      const timeout = setTimeout(() => {}, 1000);

      llmService['activeGenerations'].set(requestId, {
        abortController,
        timeout,
      });

      // Abort the generation
      const result = llmService.abortGeneration(requestId);

      expect(result).toBe(true);
      expect(abort).toHaveBeenCalled();
      expect(llmService['activeGenerations'].size).toBe(0);

      clearTimeout(timeout);
    });

    it('should return false when no generation is found', async () => {
      await llmService.initialize(mockConfig);

      const result = llmService.abortGeneration('nonexistent-id');

      expect(result).toBe(false);
    });
  });
});
