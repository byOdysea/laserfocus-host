// src/types/chat.ts
// Chat message type definitions for WebSocket communication

/**
 * Inbound message from frontend client
 */
export interface ClientMessage {
  type: 'message';
  payload: {
    text: string;
  };
}

/**
 * Outbound message to frontend client - text content
 */
export interface ServerTextMessage {
  type: 'text';
  payload: {
    content: string;
  };
}

/**
 * Outbound message to frontend client - tool status updates
 */
export interface ServerStatusMessage {
  type: 'status';
  payload: {
    state: 'processing' | 'complete';
    tool?: string;
    message: string;
    data?: Record<string, any>;
  };
}

/**
 * Outbound message to frontend client - connection status
 */
export interface ServerConnectionMessage {
  type: 'connection';
  payload: {
    state: 'connected' | 'reconnecting' | 'error';
    message: string;
    sessionId: string;
  };
}

/**
 * Outbound message to frontend client - end of response
 */
export interface ServerEndMessage {
  type: 'end';
}

/**
 * Union type for all outbound messages
 */
export type ServerMessage =
  | ServerTextMessage
  | ServerStatusMessage
  | ServerConnectionMessage
  | ServerEndMessage;

/**
 * Connection metadata for tracking client state
 */
export interface ConnectionMetadata {
  sessionId: string;
  clientId: string; // Unique per connection
  connectedAt: number;
  lastActiveAt: number;
  userAgent?: string; // For debugging client issues
}
