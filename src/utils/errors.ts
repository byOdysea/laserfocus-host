// src/utils/errors.ts
// Custom error classes for the application

/**
 * Base error class for the application
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error class for LLM Service failures
 */
export class LLMServiceError extends AppError {
  readonly cause?: Error;
  readonly context: {
    model: string;
    promptTokens?: number;
    attemptCount: number;
  };

  constructor(
    message: string,
    cause?: Error,
    context?: {
      model: string;
      promptTokens?: number;
      attemptCount: number;
    },
  ) {
    super(message);
    this.cause = cause;
    this.context = context || {
      model: 'unknown',
      attemptCount: 0,
    };
  }
}

/**
 * Error class for tool failures
 */
export class ToolExecutionError extends AppError {
  readonly cause?: Error;
  readonly context: {
    toolName: string;
    serverId: string;
    requestId: string;
    arguments: Record<string, any>;
  };

  constructor(
    message: string,
    cause?: Error,
    context?: {
      toolName: string;
      serverId: string;
      requestId: string;
      arguments: Record<string, any>;
    },
  ) {
    super(message);
    this.cause = cause;
    this.context = context || {
      toolName: 'unknown',
      serverId: 'unknown',
      requestId: 'unknown',
      arguments: {},
    };
  }
}

/**
 * Error class for tool validation failures
 */
export class ToolValidationError extends AppError {
  readonly toolName: string;
  readonly validationErrors: any[];

  constructor(toolName: string, validationErrors: any[]) {
    super(`Invalid arguments for tool: ${toolName}`);
    this.toolName = toolName;
    this.validationErrors = validationErrors;
  }
}

/**
 * Error class for tool not found
 */
export class ToolNotFoundError extends AppError {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.toolName = toolName;
  }
}

/**
 * Error class for circuit breaker open
 */
export class CircuitOpenError extends AppError {
  readonly toolName: string;
  readonly failureCount: number;
  readonly lastFailure: number;

  constructor(toolName: string, failureCount: number, lastFailure: number) {
    super(`Circuit open for tool: ${toolName} after ${failureCount} failures`);
    this.toolName = toolName;
    this.failureCount = failureCount;
    this.lastFailure = lastFailure;
  }
}

/**
 * Error class for configuration errors
 */
export class ConfigurationError extends AppError {
  readonly configPath?: string;

  constructor(message: string, configPath?: string) {
    super(message);
    this.configPath = configPath;
  }
}

/**
 * Error class for session errors
 */
export class SessionError extends AppError {
  readonly sessionId?: string;

  constructor(message: string, sessionId?: string) {
    super(message);
    this.sessionId = sessionId;
  }
}

/**
 * Error class for WebSocket connection issues
 */
export class WebSocketError extends AppError {
  readonly connectionId?: string;

  constructor(message: string, connectionId?: string) {
    super(message);
    this.connectionId = connectionId;
  }
}

/**
 * Error class for timeouts
 */
export class TimeoutError extends AppError {
  readonly operationName: string;
  readonly timeoutMs: number;

  constructor(operationName: string, timeoutMs: number) {
    super(`Operation '${operationName}' timed out after ${timeoutMs}ms`);
    this.operationName = operationName;
    this.timeoutMs = timeoutMs;
  }
}
