// src/utils/logger.ts
// Created logger utility for structured logging

import dotenv from 'dotenv';
import pino from 'pino';

// Load environment variables
dotenv.config();

// Determine log level from environment or use default
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Configure pretty printing for development
const prettyPrint = process.env.NODE_ENV !== 'production';

// Create the logger instance
const logger = pino({
  level: LOG_LEVEL,
  transport: prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  // Add base properties for all log messages
  base: {
    env: process.env.NODE_ENV || 'development',
  },
});

// Create child loggers for specific components
export const createComponentLogger = (
  component: string,
  metadata: Record<string, any> = {},
): pino.Logger => {
  return logger.child({
    component,
    ...metadata,
  });
};

// Example usage: const mcpLogger = createComponentLogger('MCPCoordinator');
// mcpLogger.info({ action: 'initialize', servers: 2 }, 'Initializing MCP Coordinator');

export default logger;
