// src/types/llm.ts
// LLM-related type definitions

import { ChatMessage } from './core';
import { ToolDefinition } from './mcp';

/**
 * Configuration for LLM providers
 */
export interface LLMConfig {
  apiKey: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  maxRetries: number;
  timeoutMs: number;
}

/**
 * Options for controlling LLM generation
 */
export interface GenerationOptions {
  maxTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  requestId?: string;
}

/**
 * Raw response from an LLM, either text or a tool call
 */
export type LLMRawResponse =
  | { type: 'text'; content: string }
  | {
      type: 'tool_call';
      tool: string;
      arguments: Record<string, any>;
    };

/**
 * Interface for LLM service providers
 */
export interface LLMService {
  /**
   * Initialize the LLM service with the given configuration
   */
  initialize(config: LLMConfig): Promise<void>;

  /**
   * Generate a chat message from the LLM, handling both text and tool calls
   * @param history The conversation history
   * @param toolDefinitions Available tool definitions
   * @param serverToolPrompts Server-specific tool description prompts
   * @param options Generation options
   */
  generateChatMessage(
    history: ChatMessage[],
    toolDefinitions: ToolDefinition[],
    serverToolPrompts: Map<string, string>,
    options?: GenerationOptions,
  ): AsyncGenerator<ChatMessage>;
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
