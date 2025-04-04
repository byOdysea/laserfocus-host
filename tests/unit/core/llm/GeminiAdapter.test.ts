// tests/unit/core/llm/GeminiAdapter.test.ts
// Tests for the GeminiAdapter class

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiAdapter } from '../../../../src/core/llm/adapters/GeminiAdapter';
import { ChatMessage } from '../../../../src/types/core';
import { LLMConfig } from '../../../../src/types/llm';
import { LLMServiceError } from '../../../../src/utils/errors';

// Mock the Google Generative AI package
jest.mock('@google/generative-ai', () => {
  // Create mock implementation
  const mockResponse = {
    response: {
      candidates: [
        {
          content: {
            parts: [{ text: 'Mock response text' }],
            role: 'model',
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
      },
    },
    stream: [{ text: () => 'Mock ' }, { text: () => 'response ' }, { text: () => 'text' }],
  };

  // Mock GenerativeModel class
  const MockGenerativeModel = jest.fn().mockImplementation(() => ({
    generateContent: jest.fn().mockResolvedValue(mockResponse),
    generateContentStream: jest.fn().mockResolvedValue(mockResponse),
  }));

  // Mock GoogleGenerativeAI class
  const MockGoogleGenerativeAI = jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue(new MockGenerativeModel()),
  }));

  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    GenerativeModel: MockGenerativeModel,
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
      HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
      HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    },
    HarmBlockThreshold: {
      BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  };
});

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;
  let mockConfig: LLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    adapter = new GeminiAdapter();
    mockConfig = {
      apiKey: 'test-api-key',
      model: 'gemini-pro',
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant',
      maxRetries: 3,
      timeoutMs: 30000,
    };
  });

  describe('initialize', () => {
    it('should initialize with the provided config', async () => {
      await adapter.initialize(mockConfig);

      // Verify GoogleGenerativeAI was constructed with the API key
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');

      // Verify getGenerativeModel was called with the right model name
      const googleAIInstance = (GoogleGenerativeAI as jest.Mock).mock.results[0].value;
      expect(googleAIInstance.getGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-pro',
          safetySettings: expect.any(Array),
          generationConfig: expect.objectContaining({
            temperature: 0.7,
          }),
        }),
      );
    });

    it('should throw an error if API key is missing', async () => {
      const configWithoutKey = { ...mockConfig, apiKey: '' };

      await expect(adapter.initialize(configWithoutKey)).rejects.toThrow(LLMServiceError);
    });
  });

  describe('formatHistoryForGemini', () => {
    it('should convert our history format to Gemini format', async () => {
      // Initialize adapter
      await adapter.initialize(mockConfig);

      // Test private method using type assertion
      const formatMethod = (adapter as any).formatHistoryForGemini.bind(adapter);

      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'system', content: 'Be helpful' },
        { role: 'tool', name: 'calculator', content: '{"result": 42}' },
      ];

      const result = formatMethod(history);

      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
        { role: 'system', parts: [{ text: 'Be helpful' }] },
        { role: 'user', parts: [{ text: '{"result": 42}' }] },
      ]);
    });
  });

  describe('generateRawResponse', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should generate raw responses from Gemini', async () => {
      // Set up mock response
      const mockGenerateContentStream = jest.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
          },
        },
        stream: [
          { text: () => 'This is a ' },
          { text: () => 'test response ' },
          { text: () => 'from Gemini.' },
        ],
      });

      const mockModel = {
        generateContentStream: mockGenerateContentStream,
      };

      // Inject the mock model
      (adapter as any).model = mockModel;

      // Call the protected method using type assertion
      const generateMethod = (adapter as any).generateRawResponse.bind(adapter);
      const formattedHistory = [{ role: 'user', parts: [{ text: 'Hello' }] }];

      // Collect all generated responses
      const responses = [];
      for await (const response of generateMethod(formattedHistory)) {
        responses.push(response);
      }

      // Verify the mock was called with the right arguments
      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        contents: expect.any(Array),
        generationConfig: expect.objectContaining({
          temperature: 0.7,
        }),
      });

      // Verify the generated responses
      expect(responses.length).toBe(1);
      expect(responses[0]).toEqual({
        type: 'text',
        content: 'This is a test response from Gemini.',
      });
    });

    it('should handle tool call responses in chunks', async () => {
      // Set up mock response that returns a tool call in chunks
      const mockGenerateContentStream = jest.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
          },
        },
        stream: [
          { text: () => '```tool\n{"tool": "search", "arguments": {"query": "test"}}\n```' },
        ],
      });

      const mockModel = {
        generateContentStream: mockGenerateContentStream,
      };

      // Inject the mock model
      (adapter as any).model = mockModel;

      // Call the protected method using type assertion
      const generateMethod = (adapter as any).generateRawResponse.bind(adapter);
      const formattedHistory = [{ role: 'user', parts: [{ text: 'Search for test' }] }];

      // Collect all generated responses
      const responses = [];
      for await (const response of generateMethod(formattedHistory)) {
        responses.push(response);
      }

      // Should parse the tool call - our implementation yields a single tool call response
      expect(responses.length).toBe(1);
      expect(responses[0]).toEqual({
        type: 'tool_call',
        tool: 'search',
        arguments: { query: 'test' },
      });
    });

    it('should handle mixed text and tool call responses', async () => {
      // Set up mock response with text followed by a tool call
      const mockGenerateContentStream = jest.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
          },
        },
        stream: [
          {
            text: () =>
              'I will search for that. ```tool\n{"tool": "search", "arguments": {"query": "test"}}\n```',
          },
        ],
      });

      const mockModel = {
        generateContentStream: mockGenerateContentStream,
      };

      // Inject the mock model
      (adapter as any).model = mockModel;

      // Call the protected method using type assertion
      const generateMethod = (adapter as any).generateRawResponse.bind(adapter);
      const formattedHistory = [{ role: 'user', parts: [{ text: 'Search for test' }] }];

      // Collect all generated responses
      const responses = [];
      for await (const response of generateMethod(formattedHistory)) {
        responses.push(response);
      }

      // Should have a single tool call since our implementation processes this in one chunk
      expect(responses.length).toBe(1);
      expect(responses[0]).toEqual({
        type: 'tool_call',
        tool: 'search',
        arguments: { query: 'test' },
      });
    });

    it('should handle invalid JSON in tool calls', async () => {
      // Set up mock response with invalid JSON
      const mockGenerateContentStream = jest.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
          },
        },
        stream: [{ text: () => '```tool\n{"tool": "search", "arguments": {invalid json}}\n```' }],
      });

      const mockModel = {
        generateContentStream: mockGenerateContentStream,
      };

      // Inject the mock model
      (adapter as any).model = mockModel;

      // Call the protected method using type assertion
      const generateMethod = (adapter as any).generateRawResponse.bind(adapter);
      const formattedHistory = [{ role: 'user', parts: [{ text: 'Search for test' }] }];

      // Collect all generated responses
      const responses = [];
      for await (const response of generateMethod(formattedHistory)) {
        responses.push(response);
      }

      // Should treat invalid JSON as text
      expect(responses.length).toBe(1);
      expect(responses[0]).toEqual({
        type: 'text',
        content: '```tool\n{"tool": "search", "arguments": {invalid json}}\n```',
      });
    });
  });

  describe('chat flow', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should process a full chat with text response', async () => {
      // Setup the mock to return text
      const mockGenerateContentStream = jest.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
          },
        },
        stream: [{ text: () => 'Hello! I am an AI assistant. How can I help you today?' }],
      });

      const mockModel = {
        generateContentStream: mockGenerateContentStream,
      };

      // Inject the mock model
      (adapter as any).model = mockModel;

      // Create a test history
      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hi there',
          createdAt: Date.now(),
        },
      ];

      // Call the public method
      const messages: ChatMessage[] = [];
      for await (const message of adapter.generateChatMessage(history, [], new Map())) {
        messages.push(message);
      }

      // Verify the responses
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hello! I am an AI assistant. How can I help you today?');
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].createdAt).toBeTruthy();
    });

    it('should process a full chat with tool call response', async () => {
      // Setup the mock to return a tool call
      const mockGenerateContentStream = jest.fn().mockResolvedValue({
        response: {
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
          },
        },
        stream: [
          { text: () => '```tool\n{"tool": "search", "arguments": {"query": "weather"}}\n```' },
        ],
      });

      const mockModel = {
        generateContentStream: mockGenerateContentStream,
      };

      // Inject the mock model
      (adapter as any).model = mockModel;

      // Create a test history
      const history: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is the weather like?',
          createdAt: Date.now(),
        },
      ];

      // Call the public method
      const messages: ChatMessage[] = [];
      for await (const message of adapter.generateChatMessage(
        history,
        [
          {
            name: 'search',
            description: 'Search for information',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        ],
        new Map(),
      )) {
        messages.push(message);
      }

      // Verify the responses
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].toolName).toBe('search');
      expect(messages[0].data).toEqual({ arguments: { query: 'weather' } });
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].createdAt).toBeTruthy();
    });
  });
});
