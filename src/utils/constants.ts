// src/utils/constants.ts
// Contains standard system messages and other constants

// Standard system messages for various scenarios
export const SYSTEM_MESSAGES = {
  WELCOME:
    "Hello! I'm an AI assistant that can help answer questions and use tools to get information.",
  TOOL_ERROR: (toolName: string, error: string): string =>
    `I encountered an error when using the ${toolName} tool: ${error}. Let me try a different approach.`,
  RATE_LIMITED: "I'm currently processing too many requests. Please try again in a moment.",
  MAINTENANCE: 'The system is currently undergoing maintenance. Some features may be unavailable.',
  TOOL_EXECUTION_START: (toolName: string): string => `Executing ${toolName} tool...`,
  TOOL_EXECUTION_COMPLETE: (toolName: string): string => `Completed ${toolName} tool execution.`,
  LLM_ERROR: "I'm having trouble generating a response right now. Please try again shortly.",
  UNEXPECTED_ERROR:
    'I encountered an unexpected error. Please try again or try a different request.',
};

// Default timeouts in milliseconds
export const TIMEOUTS = {
  TOOL_EXECUTION: parseInt(process.env.DEFAULT_TOOL_TIMEOUT_MS || '5000', 10),
  LLM_GENERATION: 30000, // 30 seconds
  WEBSOCKET_HEARTBEAT: 30000, // 30 seconds
  SESSION_CLEANUP: 3600000, // 1 hour
};

// Retry configurations
export const RETRY_CONFIG = {
  LLM: {
    MAX_ATTEMPTS: 3,
    DELAY_MS: 1000,
  },
  TOOL: {
    MAX_ATTEMPTS: 2,
    DELAY_MS: 500,
  },
};

// Circuit breaker settings
export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  RESET_TIMEOUT_MS: 60000, // 1 minute
};

// Token count limits
export const TOKEN_LIMITS = {
  MAX_CONTEXT_WINDOW: parseInt(process.env.MAX_TOKEN_COUNT || '8192', 10),
  HISTORY_TRUNCATION_TARGET: 7500, // Target token count after truncation
  MIN_RETAINED_MESSAGES: 10, // Always keep at least this many most recent messages
};
