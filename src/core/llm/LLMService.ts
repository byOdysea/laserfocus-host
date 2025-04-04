// src/core/llm/LLMService.ts
// Base implementation of the LLM Service

import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../../types/core';
import {
  GenerationOptions,
  LLMConfig,
  LLMRawResponse,
  LLMService as LLMServiceInterface,
  TokenUsage,
} from '../../types/llm';
import { ToolDefinition } from '../../types/mcp';
import { LLMServiceError, TimeoutError } from '../../utils/errors';
import logger from '../../utils/logger';

/**
 * Abstract base LLM service implementation
 */
export abstract class LLMService implements LLMServiceInterface {
  protected config: LLMConfig | null = null;
  protected activeGenerations = new Map<
    string,
    { abortController: AbortController; timeout: NodeJS.Timeout }
  >();
  protected tokenUsageBySession = new Map<string, TokenUsage>();

  /**
   * Initialize the LLM service with the given configuration
   */
  async initialize(config: LLMConfig): Promise<void> {
    this.config = config;
    logger.info({ component: 'LLMService', action: 'initialize' }, 'LLM service initialized');
  }

  /**
   * Generate a chat message from the LLM, handling both text and tool calls
   */
  async *generateChatMessage(
    history: ChatMessage[],
    toolDefinitions: ToolDefinition[],
    serverToolPrompts: Map<string, string>,
    options?: GenerationOptions,
  ): AsyncGenerator<ChatMessage> {
    if (!this.config) {
      throw new LLMServiceError('LLM service not initialized', undefined, {
        model: 'unknown',
        attemptCount: 0,
      });
    }

    const requestId = options?.requestId || uuidv4();
    const timeoutMs = options?.timeoutMs || this.config.timeoutMs;
    const formattedHistory = this.formatHistoryForLLM(history);
    const systemPrompt = this.compileSystemPrompt(
      this.config.systemPrompt,
      toolDefinitions,
      serverToolPrompts,
    );

    // Setup abort controller and timeout
    const abortController = new AbortController();
    const { signal } = abortController;

    const timeout = setTimeout(() => {
      abortController.abort();
      const error = new TimeoutError('LLM generation', timeoutMs);
      logger.warn(
        { component: 'LLMService', action: 'timeout', requestId, error },
        'LLM generation timed out',
      );
    }, timeoutMs);

    this.activeGenerations.set(requestId, { abortController, timeout });

    try {
      // Add the system prompt to the formatted history
      const historyWithSystemPrompt = [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
      ];

      // Generate the raw response from the LLM
      const rawResponseGenerator = this.generateRawResponse(historyWithSystemPrompt, {
        ...options,
        requestId,
        abortSignal: signal,
      });

      // Process each raw response chunk
      for await (const rawResponse of rawResponseGenerator) {
        const chatMessage = this.convertRawResponseToChatMessage(rawResponse);
        yield {
          ...chatMessage,
          id: uuidv4(),
          createdAt: Date.now(),
        };
      }
    } catch (error) {
      // Handle aborted requests
      if (signal.aborted) {
        throw new TimeoutError('LLM generation', timeoutMs);
      }

      // Handle other errors
      throw new LLMServiceError(
        'Error generating LLM response',
        error instanceof Error ? error : new Error(String(error)),
        {
          model: this.config.model,
          attemptCount: 1, // This would be incremented by the orchestrator if it retries
        },
      );
    } finally {
      clearTimeout(timeout);
      this.activeGenerations.delete(requestId);
    }
  }

  /**
   * Format conversation history for LLM consumption
   */
  protected formatHistoryForLLM(history: ChatMessage[]): any[] {
    return history.map((message) => {
      // Basic role mapping
      switch (message.role) {
        case 'user':
          return { role: 'user', content: message.content || '' };
        case 'assistant':
          if (message.toolName) {
            return {
              role: 'assistant',
              content: `I'll use the ${message.toolName} tool.`,
              // The specific format might vary by LLM provider
            };
          }
          return { role: 'assistant', content: message.content || '' };
        case 'system':
          return { role: 'system', content: message.content || '' };
        case 'tool':
          return {
            role: 'tool',
            name: message.toolName,
            content: JSON.stringify(message.data || {}),
          };
        default:
          return { role: 'user', content: message.content || '' };
      }
    });
  }

  /**
   * Attempt to parse a tool call from a text string
   */
  protected parseToolCall(text: string): { tool: string; arguments: Record<string, any> } | null {
    try {
      // Look for standard tool call format (```tool {...} ```)
      const toolPattern = /```tool\s*\n([\s\S]*?)```/;
      const match = text.match(toolPattern);

      if (!match || !match[1]) return null;

      const jsonText = match[1].trim();
      const toolCall = JSON.parse(jsonText);

      if (typeof toolCall !== 'object' || !toolCall.tool || !toolCall.arguments) {
        return null;
      }

      return {
        tool: toolCall.tool,
        arguments: toolCall.arguments,
      };
    } catch (error) {
      logger.debug(
        { component: 'LLMService', action: 'parseToolCall', error },
        'Failed to parse tool call',
      );
      return null;
    }
  }

  /**
   * Convert a raw LLM response to a chat message
   */
  protected convertRawResponseToChatMessage(
    response: LLMRawResponse,
  ): Omit<ChatMessage, 'id' | 'createdAt'> {
    if (response.type === 'text') {
      // Try to detect if the text contains a tool call
      const toolCall = this.parseToolCall(response.content);

      if (toolCall) {
        return {
          role: 'assistant',
          toolName: toolCall.tool,
          data: { arguments: toolCall.arguments },
        };
      }

      // Regular text message
      return {
        role: 'assistant',
        content: response.content,
      };
    } else {
      // Direct tool call from LLM
      return {
        role: 'assistant',
        toolName: response.tool,
        data: { arguments: response.arguments },
      };
    }
  }

  /**
   * Estimate the number of tokens in a text string
   * This is a simplified approach - actual token counting depends on the tokenizer
   */
  protected estimateTokenCount(text: string): number {
    // A very rough estimate - one token is approximately 4 characters in English
    return Math.ceil(text.length / 4);
  }

  /**
   * Compile the system prompt from base prompt, tool definitions, and server-specific guidance
   */
  protected compileSystemPrompt(
    basePrompt: string,
    toolDefinitions: ToolDefinition[],
    serverToolPrompts: Map<string, string>,
  ): string {
    let prompt = basePrompt.trim();

    // Add tool-calling format instructions
    prompt += `\n\nWhen calling a tool, respond ONLY with a tool call JSON wrapped in triple backticks and 'tool' language marker like this:
\`\`\`tool
{ "tool": "toolName", "arguments": { "arg1": "value1", "arg2": "value2" } }
\`\`\`
Do not add any other text before or after the tool call.`;

    // Add tool definitions
    if (toolDefinitions.length > 0) {
      prompt += '\n\nAvailable tools:\n';

      toolDefinitions.forEach((tool) => {
        prompt += `\n- ${tool.name}: ${tool.description}`;
        prompt += `\n  Parameters: ${JSON.stringify(tool.parameters, null, 2)}`;
        if (tool.examples && tool.examples.length > 0) {
          prompt += `\n  Example: ${JSON.stringify(tool.examples[0], null, 2)}`;
        }
        prompt += '\n';
      });
    }

    // Add server-specific guidance if available
    if (serverToolPrompts.size > 0) {
      prompt += '\n\nAdditional guidance for using tools:\n';

      serverToolPrompts.forEach((promptText, serverId) => {
        prompt += `\n## Server: ${serverId}\n${promptText}\n`;
      });
    }

    return prompt;
  }

  /**
   * Abort an ongoing generation
   */
  abortGeneration(requestId: string): boolean {
    const generation = this.activeGenerations.get(requestId);
    if (!generation) return false;

    generation.abortController.abort();
    clearTimeout(generation.timeout);
    this.activeGenerations.delete(requestId);

    return true;
  }

  /**
   * Get token usage for a session
   */
  getTokenUsage(sessionId: string): TokenUsage | null {
    return this.tokenUsageBySession.get(sessionId) || null;
  }

  /**
   * Internal method to generate raw responses from the LLM
   * Must be implemented by concrete subclasses
   */
  protected abstract generateRawResponse(
    formattedHistory: any[],
    options?: GenerationOptions & { abortSignal?: AbortSignal },
  ): AsyncGenerator<LLMRawResponse>;
}
