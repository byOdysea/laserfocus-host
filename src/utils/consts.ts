export const SYSTEM_MESSAGES = {
  WELCOME:
    "Hello! I'm an AI assistant that can help answer questions and use tools to get information.",
  TOOL_ERROR: (toolName: string, error: string) =>
    `I encountered an error when using the ${toolName} tool: ${error}. Let me try a different approach.`,
  RATE_LIMITED:
    "I'm currently processing too many requests. Please try again in a moment.",
  MAINTENANCE:
    "The system is currently undergoing maintenance. Some features may be unavailable.",
};
