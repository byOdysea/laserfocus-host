// src/types/core.ts
// Core type definitions for the application

/**
 * Request context for tracing and correlating actions
 */
export interface RequestContext {
  requestId: string;
  sessionId: string;
  parentRequestId?: string;
  startTime: number;
  traceId: string;
  labels: Record<string, string>;
}

/**
 * Session data structure for storing conversation state
 */
export interface Session {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  connectionId: string; // Single connection ID per session for MVP
  history: ChatMessage[];
  metadata: Record<string, any>;
}

/**
 * Chat message type for the conversation history
 */
export interface ChatMessage {
  id: string; // Unique identifier
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string; // Text content (for user/assistant/system)
  data?: any; // Structured data (for tool results)
  createdAt: number; // Timestamp
  toolName?: string; // Name of tool if role is "tool"
  kind?: 'start' | 'progress' | 'complete'; // Message phase for tools
  metadata?: Record<string, any>; // Additional message metadata
}

/**
 * Options for token and context window management
 */
export interface HistoryManagementOptions {
  maxTokenCount: number; // Max tokens to send to LLM
  summarizationThreshold?: number; // When to summarize old messages
  retainNewestMessages: number; // Always keep N newest messages
}

/**
 * Enhanced error tracking
 */
export interface ErrorContext {
  component: string;
  action: string;
  attemptCount: number;
  originalError: Error;
  recoveryAction?: 'retry' | 'fallback' | 'abort';
  timestamp: number;
  sessionId: string;
  requestId: string;
}

/**
 * Configuration for the conversation orchestrator
 */
export interface OrchestratorConfig {
  maxHistoryLength: number;
  retryAttempts: number;
  retryDelay: number;
  maxTokenCount?: number; // For context window management
}

/**
 * Token usage metrics for monitoring
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
