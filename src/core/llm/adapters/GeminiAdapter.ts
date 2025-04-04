// src/core/llm/adapters/GeminiAdapter.ts
// Implementation of the LLM Service for Google's Gemini model

import {
  Content,
  GenerativeModel,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  Part,
} from '@google/generative-ai';
import { GenerationOptions, LLMConfig, LLMRawResponse } from '../../../types/llm';
import { LLMServiceError } from '../../../utils/errors';
import logger from '../../../utils/logger';
import { LLMService } from '../LLMService';

/**
 * Adapter for Google's Gemini model
 */
export class GeminiAdapter extends LLMService {
  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;

  /**
   * Initialize the Gemini model with the given configuration
   */
  async initialize(config: LLMConfig): Promise<void> {
    await super.initialize(config);

    if (!config.apiKey) {
      throw new LLMServiceError('Missing Gemini API key', undefined, {
        model: config.model,
        attemptCount: 0,
      });
    }

    try {
      // Initialize the Gemini client
      this.client = new GoogleGenerativeAI(config.apiKey);

      // Initialize the model
      this.model = this.client.getGenerativeModel({
        model: config.model,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: 2048, // Default, can be overridden by options
        },
      });

      logger.info(
        { component: 'GeminiAdapter', action: 'initialize', model: config.model },
        'Gemini model initialized',
      );
    } catch (error) {
      throw new LLMServiceError(
        'Failed to initialize Gemini model',
        error instanceof Error ? error : new Error(String(error)),
        {
          model: config.model,
          attemptCount: 0,
        },
      );
    }
  }

  /**
   * Convert our history format to Gemini's content format
   */
  private formatHistoryForGemini(history: any[]): Content[] {
    return history.map((message): Content => {
      // Map our roles to Gemini roles
      let role: 'user' | 'model' | 'system' = 'user';
      switch (message.role) {
        case 'user':
          role = 'user';
          break;
        case 'assistant':
          role = 'model';
          break;
        case 'system':
          role = 'system'; // Note: Gemini may handle system messages differently
          break;
        case 'tool':
          // For tool responses, we'll treat them as user messages with tool results
          role = 'user';
          break;
      }

      // Create the parts array based on the message type
      const parts: Part[] = [];

      if (message.content) {
        parts.push({ text: message.content });
      } else if (message.role === 'tool' && message.name && message.content) {
        // Format tool results
        parts.push({
          text: `Result from ${message.name}: ${message.content}`,
        });
      }

      return { role, parts };
    });
  }

  /**
   * Generate raw responses from Gemini
   */
  protected async *generateRawResponse(
    formattedHistory: any[],
    options?: GenerationOptions & { abortSignal?: AbortSignal },
  ): AsyncGenerator<LLMRawResponse> {
    if (!this.model || !this.config) {
      throw new LLMServiceError('Gemini model not initialized', undefined, {
        model: 'unknown',
        attemptCount: 0,
      });
    }

    try {
      // Convert history to Gemini format
      const geminiHistory = this.formatHistoryForGemini(formattedHistory);

      // Generate content from Gemini
      const generationConfig = {
        temperature: this.config.temperature,
        maxOutputTokens: options?.maxTokens || 2048,
      };

      // Stream the response from Gemini
      const result = await this.model.generateContentStream({
        contents: geminiHistory,
        generationConfig,
      });

      // Process each chunk in the stream
      let textBuffer = '';

      // Define the tool call pattern
      const toolCallPattern = /```tool\s*\n([\s\S]*?)```/;

      for await (const chunk of result.stream) {
        // Check if request was aborted
        if (options?.abortSignal?.aborted) {
          return;
        }

        // Extract text from the chunk
        const chunkText = chunk.text();
        if (!chunkText) continue;

        // Append to buffer
        textBuffer += chunkText;

        // Check if we have a complete tool call
        const match = textBuffer.match(toolCallPattern);

        if (match && match[1]) {
          try {
            // Try to parse the tool call
            const jsonText = match[1].trim();
            const toolCall = JSON.parse(jsonText);

            if (typeof toolCall === 'object' && toolCall.tool && toolCall.arguments) {
              // Valid tool call, yield it
              yield {
                type: 'tool_call',
                tool: toolCall.tool,
                arguments: toolCall.arguments,
              };

              // Clear the buffer
              textBuffer = textBuffer.substring(match.index! + match[0].length);
            } else {
              // Invalid tool call JSON structure, treat as text
              yield {
                type: 'text',
                content: textBuffer,
              };
              textBuffer = '';
            }
          } catch (parseError) {
            // JSON parsing error, treat as regular text
            yield {
              type: 'text',
              content: textBuffer,
            };
            textBuffer = '';
          }
        } else if (textBuffer.length > 100 && !textBuffer.includes('```tool')) {
          // If buffer is getting large and doesn't contain a tool marker, flush it as text
          yield {
            type: 'text',
            content: textBuffer,
          };
          textBuffer = '';
        }
      }

      // Flush any remaining text in the buffer
      if (textBuffer) {
        // Check one more time for a tool call pattern
        const finalMatch = textBuffer.match(toolCallPattern);

        if (finalMatch && finalMatch[1]) {
          try {
            const jsonText = finalMatch[1].trim();
            const toolCall = JSON.parse(jsonText);

            if (typeof toolCall === 'object' && toolCall.tool && toolCall.arguments) {
              yield {
                type: 'tool_call',
                tool: toolCall.tool,
                arguments: toolCall.arguments,
              };

              // Yield any remaining text after the tool call
              const remainingText = textBuffer
                .substring(finalMatch.index! + finalMatch[0].length)
                .trim();
              if (remainingText) {
                yield {
                  type: 'text',
                  content: remainingText,
                };
              }
            } else {
              // Invalid tool call structure
              yield {
                type: 'text',
                content: textBuffer,
              };
            }
          } catch (parseError) {
            // JSON parsing failed
            yield {
              type: 'text',
              content: textBuffer,
            };
          }
        } else {
          // No tool call pattern found
          yield {
            type: 'text',
            content: textBuffer,
          };
        }
      }

      // Update token usage metrics if available
      try {
        const response = await result.response;

        // Get token usage if available
        // Note: The API response structure might change; this is based on current documentation
        const promptTokens =
          // @ts-ignore - Accessing potentially undefined properties safely
          response?.usageMetadata?.promptTokenCount ||
          // @ts-ignore
          response?.candidates?.[0]?.usageMetadata?.promptTokenCount ||
          0;

        const completionTokens =
          // @ts-ignore - Accessing potentially undefined properties safely
          response?.usageMetadata?.candidatesTokenCount ||
          // @ts-ignore
          response?.candidates?.[0]?.usageMetadata?.completionTokenCount ||
          0;

        if (promptTokens > 0 || completionTokens > 0) {
          const sessionId = options?.requestId?.split('-')[0] || 'unknown';
          this.tokenUsageBySession.set(sessionId, {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          });
        }
      } catch (error) {
        logger.debug(
          { component: 'GeminiAdapter', action: 'tokenUsage', error },
          'Failed to fetch token usage metadata',
        );
      }
    } catch (error) {
      throw new LLMServiceError(
        'Error generating content from Gemini',
        error instanceof Error ? error : new Error(String(error)),
        {
          model: this.config.model,
          attemptCount: 1,
        },
      );
    }
  }
}
