export class LLMServiceError extends Error {
  constructor(
    message: string,
    public readonly cause: Error,
    public readonly context: {
      model: string;
      promptTokens?: number;
      attemptCount: number;
    }
  ) {
    super(message);
    this.name = "LLMServiceError";
  }
}

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly cause: Error,
    public readonly context: {
      toolName: string;
      serverId: string;
      requestId: string;
      arguments: object;
    }
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly validationErrors: any[]
  ) {
    super(`Invalid arguments for tool: ${toolName}`);
    this.name = "ToolValidationError";
  }
}

export class CircuitOpenError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly failureCount: number,
    public readonly lastFailure: number
  ) {
    super(`Circuit open for tool: ${toolName} after ${failureCount} failures`);
    this.name = "CircuitOpenError";
  }
}
