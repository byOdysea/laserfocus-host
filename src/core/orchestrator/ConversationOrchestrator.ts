// src/core/orchestrator/ConversationOrchestrator.ts
// Implementation of the Conversation Orchestrator

import { v4 as uuidv4 } from 'uuid';
import { SessionManager } from '../../session';
import {
  ChatMessage,
  ErrorContext,
  HistoryManagementOptions,
  OrchestratorConfig,
  ServerMessage,
} from '../../types';
import { ToolCallRequest } from '../../types/mcp';
import { SYSTEM_MESSAGES } from '../../utils/constants';
import {
  LLMServiceError,
  ToolExecutionError,
  ToolNotFoundError,
  ToolValidationError,
} from '../../utils/errors';
import logger from '../../utils/logger';
import { LLMService } from '../llm';
import { MCPCoordinator } from '../mcp';

// Maximum depth for nested tool calls to prevent stack overflows
const MAX_TOOL_CALL_DEPTH = 3;

/**
 * Conversation Orchestrator
 *
 * Acts as the central coordinator for the entire chat experience, managing conversation state,
 * delegating to the LLM and tools, and ensuring coherent conversation flow.
 */
export class ConversationOrchestrator {
  private llmService: LLMService;
  private mcpCoordinator: MCPCoordinator;
  private sessionManager: SessionManager;
  private config: OrchestratorConfig;
  private activeRequests = new Map<
    string,
    { abortController: AbortController; timeouts: NodeJS.Timeout[] }
  >();

  /**
   * Creates a new Conversation Orchestrator
   * @param llmService The LLM Service for generating responses
   * @param mcpCoordinator The MCP Coordinator for executing tools
   * @param sessionManager The Session Manager for tracking conversation state
   * @param config Configuration options
   */
  constructor(
    llmService: LLMService,
    mcpCoordinator: MCPCoordinator,
    sessionManager: SessionManager,
    config: Partial<OrchestratorConfig> = {},
  ) {
    this.llmService = llmService;
    this.mcpCoordinator = mcpCoordinator;
    this.sessionManager = sessionManager;
    this.config = {
      maxHistoryLength: config.maxHistoryLength || 100,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      maxTokenCount: config.maxTokenCount || 8192,
    };

    logger.info(
      { component: 'ConversationOrchestrator', config: this.config },
      'Conversation Orchestrator initialized',
    );
  }

  /**
   * Processes user input and yields response messages asynchronously
   * @param sessionId The session ID
   * @param text The user input text
   * @returns An async generator yielding server messages
   */
  async *handleInput(sessionId: string, text: string): AsyncGenerator<ServerMessage> {
    const requestId = uuidv4();
    const abortController = new AbortController();
    this.activeRequests.set(requestId, { abortController, timeouts: [] });

    try {
      logger.info(
        { component: 'ConversationOrchestrator', action: 'handleInput', sessionId, requestId },
        'Processing user input',
      );

      // Add user message to history
      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      };
      this.addMessageToHistory(sessionId, userMessage);

      // Prune history if needed
      this.pruneHistory(sessionId, {
        maxTokenCount: this.config.maxTokenCount || 8192,
        retainNewestMessages: 10,
      });

      // Get tool definitions from MCP Coordinator
      const toolDefinitions = this.mcpCoordinator.getAvailableTools();
      // Get server-specific tool prompts
      const serverToolPrompts = this.mcpCoordinator.getAllToolDescriptionPrompts();

      // Get conversation history
      const history = this.sessionManager.getHistory(sessionId);

      // Process with the LLM for initial response
      let retryCount = 0;
      let llmSuccess = false;

      while (retryCount <= this.config.retryAttempts && !llmSuccess) {
        try {
          const llmResponseGenerator = this.llmService.generateChatMessage(
            history,
            toolDefinitions,
            serverToolPrompts,
            {
              requestId,
              abortSignal: abortController.signal,
            },
          );

          // Process each response chunk from the LLM
          for await (const message of llmResponseGenerator) {
            // Add to history
            this.addMessageToHistory(sessionId, message);

            if (message.toolName) {
              // Handle tool call (initial call depth is 0)
              for await (const statusMsg of this.handleToolCall(sessionId, requestId, message, 0)) {
                yield statusMsg;
              }
            } else if (message.content) {
              // Handle text response
              yield {
                type: 'text',
                payload: {
                  content: message.content,
                },
              };
            }
          }

          llmSuccess = true;
        } catch (error) {
          retryCount++;

          // Handle different error scenarios
          if (error instanceof LLMServiceError) {
            logger.warn(
              {
                component: 'ConversationOrchestrator',
                action: 'llmGenerate',
                sessionId,
                requestId,
                attemptCount: retryCount,
                error,
              },
              `LLM generation failed, attempt ${retryCount}/${this.config.retryAttempts}`,
            );

            // If we've reached max retries, add a system message and yield an error message
            if (retryCount > this.config.retryAttempts) {
              const errorMessage = this.createSystemMessage(SYSTEM_MESSAGES.LLM_ERROR, {
                error: error.message,
              });
              this.addMessageToHistory(sessionId, errorMessage);

              yield {
                type: 'text',
                payload: {
                  content: SYSTEM_MESSAGES.LLM_ERROR,
                },
              };
              break;
            }

            // Wait before retrying
            await this.delayWithCleanup(this.config.retryDelay, requestId);
          } else if (abortController.signal.aborted) {
            // Request was aborted
            logger.info(
              { component: 'ConversationOrchestrator', action: 'abort', sessionId, requestId },
              'Request aborted',
            );
            break;
          } else {
            // Unexpected error, don't retry
            logger.error(
              {
                component: 'ConversationOrchestrator',
                action: 'handleInput',
                sessionId,
                requestId,
                error,
              },
              'Unexpected error processing user input',
            );

            const errorMessage = this.createSystemMessage(SYSTEM_MESSAGES.UNEXPECTED_ERROR, {
              error: error instanceof Error ? error.message : String(error),
            });
            this.addMessageToHistory(sessionId, errorMessage);

            yield {
              type: 'text',
              payload: {
                content: SYSTEM_MESSAGES.UNEXPECTED_ERROR,
              },
            };
            break;
          }
        }
      }

      // Signal end of response
      yield { type: 'end' };
    } finally {
      // Ensure we clean up all resources
      this.cleanupRequest(requestId);
    }
  }

  /**
   * Adds a timeout and tracks it for cleanup
   * @param ms Milliseconds to delay
   * @param requestId The request ID for cleanup tracking
   * @returns Promise that resolves after the delay
   */
  private delayWithCleanup(ms: number, requestId: string): Promise<void> {
    return new Promise((resolve) => {
      const request = this.activeRequests.get(requestId);
      if (!request) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        resolve();
      }, ms);

      request.timeouts.push(timeout);
    });
  }

  /**
   * Cleans up all resources for a request
   * @param requestId The request ID to clean up
   */
  private cleanupRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      // Clear any pending timeouts
      for (const timeout of request.timeouts) {
        clearTimeout(timeout);
      }
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Handles a tool call from the LLM
   * @param sessionId The session ID
   * @param requestId The request ID
   * @param message The tool call message
   * @param depth Current recursion depth (to prevent stack overflows)
   * @returns An async generator yielding server messages
   */
  private async *handleToolCall(
    sessionId: string,
    requestId: string,
    message: ChatMessage,
    depth: number,
  ): AsyncGenerator<ServerMessage> {
    if (!message.toolName || !message.data?.arguments) {
      logger.warn(
        { component: 'ConversationOrchestrator', action: 'handleToolCall', sessionId, requestId },
        'Invalid tool call message',
      );
      return;
    }

    const toolName = message.toolName;
    const toolArgs = message.data.arguments;

    // Check if we've exceeded the maximum tool call depth
    if (depth >= MAX_TOOL_CALL_DEPTH) {
      logger.warn(
        {
          component: 'ConversationOrchestrator',
          action: 'handleToolCall',
          sessionId,
          requestId,
          toolName,
          depth,
        },
        'Maximum tool call depth exceeded',
      );

      const maxDepthMessage = this.createSystemMessage(
        `I've reached the maximum number of nested tool calls. Let me summarize what I've found so far.`,
        { maxDepthExceeded: true, toolName },
      );
      this.addMessageToHistory(sessionId, maxDepthMessage);

      yield {
        type: 'text',
        payload: {
          content: maxDepthMessage.content || 'Maximum tool call depth exceeded',
        },
      };
      return;
    }

    try {
      // Send processing status
      yield {
        type: 'status',
        payload: {
          state: 'processing',
          tool: toolName,
          message: `Using the ${toolName} tool...`,
        },
      };

      // Create tool call request
      const toolRequest: ToolCallRequest = {
        toolName,
        arguments: toolArgs,
        requestId: `${requestId}-tool-${uuidv4()}`,
      };

      // Execute the tool
      const toolResponse = await this.mcpCoordinator.executeTool(toolRequest);

      // Add tool result to history
      const toolResultMessage: ChatMessage = {
        id: uuidv4(),
        role: 'tool',
        toolName: toolResponse.toolName,
        data: toolResponse.result,
        createdAt: Date.now(),
        kind: 'complete',
      };
      this.addMessageToHistory(sessionId, toolResultMessage);

      // Send completion status with the result
      yield {
        type: 'status',
        payload: {
          state: 'complete',
          tool: toolName,
          message: `Completed using ${toolName}`,
          data: toolResponse.result,
        },
      };

      // Re-prompt LLM with the tool result for follow-up response
      const history = this.sessionManager.getHistory(sessionId);
      const toolDefinitions = this.mcpCoordinator.getAvailableTools();
      const serverToolPrompts = this.mcpCoordinator.getAllToolDescriptionPrompts();

      // Generate follow-up response from LLM
      const llmResponseGenerator = this.llmService.generateChatMessage(
        history,
        toolDefinitions,
        serverToolPrompts,
        {
          requestId: `${requestId}-followup-${depth}`,
        },
      );

      // Process follow-up response
      for await (const followupMessage of llmResponseGenerator) {
        this.addMessageToHistory(sessionId, followupMessage);

        if (followupMessage.toolName) {
          // Handle nested tool call (incrementing depth)
          for await (const nestedMsg of this.handleToolCall(
            sessionId,
            requestId,
            followupMessage,
            depth + 1,
          )) {
            yield nestedMsg;
          }
        } else if (followupMessage.content) {
          // Handle text response
          yield {
            type: 'text',
            payload: {
              content: followupMessage.content,
            },
          };
        }
      }
    } catch (error) {
      // Handle tool execution errors
      let errorMessage: string;

      if (error instanceof ToolNotFoundError) {
        errorMessage = `I couldn't find the tool "${toolName}".`;
      } else if (error instanceof ToolValidationError) {
        errorMessage = `There was an issue with the arguments for the "${toolName}" tool: ${error.message}`;
      } else if (error instanceof ToolExecutionError) {
        errorMessage = SYSTEM_MESSAGES.TOOL_ERROR(toolName, error.message);
      } else {
        errorMessage = `An error occurred while using the "${toolName}" tool: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }

      // Log the error
      logger.error(
        {
          component: 'ConversationOrchestrator',
          action: 'handleToolCall',
          sessionId,
          requestId,
          toolName,
          error,
        },
        'Tool execution failed',
      );

      // Add error message to history
      const errorSystemMessage = this.createSystemMessage(errorMessage, {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      this.addMessageToHistory(sessionId, errorSystemMessage);

      // Send completion status with error
      yield {
        type: 'status',
        payload: {
          state: 'complete',
          tool: toolName,
          message: errorMessage,
          data: { error: error instanceof Error ? error.message : String(error) },
        },
      };

      // Generate recovery response from LLM
      try {
        const history = this.sessionManager.getHistory(sessionId);
        const toolDefinitions = this.mcpCoordinator.getAvailableTools();
        const serverToolPrompts = this.mcpCoordinator.getAllToolDescriptionPrompts();

        const recoveryResponseGenerator = this.llmService.generateChatMessage(
          history,
          toolDefinitions,
          serverToolPrompts,
          {
            requestId: `${requestId}-recovery-${depth}`,
          },
        );

        for await (const recoveryMessage of recoveryResponseGenerator) {
          this.addMessageToHistory(sessionId, recoveryMessage);

          if (recoveryMessage.content) {
            yield {
              type: 'text',
              payload: {
                content: recoveryMessage.content,
              },
            };
          } else if (recoveryMessage.toolName && depth < MAX_TOOL_CALL_DEPTH - 1) {
            // Only process tool calls if we haven't reached max depth
            for await (const nestedMsg of this.handleToolCall(
              sessionId,
              requestId,
              recoveryMessage,
              depth + 1,
            )) {
              yield nestedMsg;
            }
          }
        }
      } catch (recoveryError) {
        // If recovery also fails, send a simple message
        logger.error(
          {
            component: 'ConversationOrchestrator',
            action: 'recoveryResponse',
            sessionId,
            requestId,
            error: recoveryError,
          },
          'Failed to generate recovery response',
        );

        yield {
          type: 'text',
          payload: {
            content: `I had trouble with the "${toolName}" tool. Let me know if you'd like to try something else.`,
          },
        };
      }
    }
  }

  /**
   * Adds a message to the conversation history
   * @param sessionId The session ID
   * @param message The message to add
   */
  addMessageToHistory(sessionId: string, message: ChatMessage): void {
    this.sessionManager.addMessageToHistory(sessionId, message);

    logger.debug(
      {
        component: 'ConversationOrchestrator',
        action: 'addMessageToHistory',
        sessionId,
        messageId: message.id,
        messageRole: message.role,
      },
      'Added message to history',
    );
  }

  /**
   * Gets the conversation history for a session
   * @param sessionId The session ID
   * @returns The conversation history
   */
  getHistory(sessionId: string): ChatMessage[] {
    return this.sessionManager.getHistory(sessionId);
  }

  /**
   * Prunes the conversation history to manage context window size
   * @param sessionId The session ID
   * @param options Options for pruning
   * @returns The pruned history
   */
  pruneHistory(sessionId: string, options?: HistoryManagementOptions): ChatMessage[] {
    // For MVP, this is a simple implementation that just truncates by count
    // and doesn't attempt to summarize or do token-based management
    const history = this.sessionManager.getHistory(sessionId);

    if (!history.length) return [];

    // If within limits, return as is
    if (history.length <= this.config.maxHistoryLength) {
      return history;
    }

    // Simple truncation strategy - keep only the most recent messages
    const retain =
      options?.retainNewestMessages || Math.min(10, Math.floor(this.config.maxHistoryLength / 2));
    const truncatedHistory = history.slice(-retain);

    // Add a system message noting the truncation
    const truncationMessage = this.createSystemMessage(
      'Some earlier messages have been removed to manage conversation length.',
      { truncatedMessages: history.length - truncatedHistory.length },
    );

    // Replace the history
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      session.history = [truncationMessage, ...truncatedHistory];
    }

    logger.info(
      {
        component: 'ConversationOrchestrator',
        action: 'pruneHistory',
        sessionId,
        originalLength: history.length,
        newLength: truncatedHistory.length + 1,
      },
      'Pruned conversation history',
    );

    return this.sessionManager.getHistory(sessionId);
  }

  /**
   * Creates a system message
   * @param content The message content
   * @param metadata Optional metadata
   * @returns A system message
   */
  createSystemMessage(content: string, metadata?: Record<string, any>): ChatMessage {
    return {
      id: uuidv4(),
      role: 'system',
      content,
      createdAt: Date.now(),
      metadata,
    };
  }

  /**
   * Aborts an active tool execution
   * @param sessionId The session ID
   * @param requestId The request ID
   * @returns True if abort was successful
   */
  abortActiveToolExecution(sessionId: string, requestId: string): Promise<boolean> {
    logger.info(
      { component: 'ConversationOrchestrator', action: 'abort', sessionId, requestId },
      'Aborting active tool execution',
    );

    const activeRequest = this.activeRequests.get(requestId);
    if (activeRequest) {
      activeRequest.abortController.abort();
      this.cleanupRequest(requestId);
      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }

  /**
   * Handles errors with structured context
   * @param context The error context
   */
  async handleErrorWithContext(context: ErrorContext): Promise<void> {
    logger.error(
      {
        ...context,
      },
      `Error during ${context.action}: ${context.originalError.message}`,
    );

    // Could implement more sophisticated error handling here in the future
    // such as alerting, fallbacks, or recovery strategies beyond simple retries
  }
}
