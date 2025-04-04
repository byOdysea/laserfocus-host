// src/session/SessionManager.ts
// Session management interface for MVP

import { ChatMessage, Session } from '../types';

/**
 * Interface for session management functionality
 */
export interface SessionManager {
  /**
   * Creates a new session with optional metadata
   * @param metadata Optional metadata to associate with the session
   * @returns The session ID
   */
  createSession(metadata?: Record<string, any>): string;

  /**
   * Gets a session by ID
   * @param sessionId The session ID
   * @returns The session or null if not found
   */
  getSession(sessionId: string): Session | null;

  /**
   * Adds a connection to a session
   * @param sessionId The session ID
   * @param connectionId The connection ID
   */
  addConnectionToSession(sessionId: string, connectionId: string): void;

  /**
   * Removes a connection from a session
   * @param sessionId The session ID
   * @param connectionId The connection ID
   */
  removeConnectionFromSession(sessionId: string, connectionId: string): void;

  /**
   * Gets all active sessions
   * @returns Array of all sessions
   */
  getAllSessions(): Session[];

  /**
   * Cleans up inactive sessions older than the specified age
   * @param maxAgeMs Maximum age in milliseconds
   */
  cleanupInactiveSessions(maxAgeMs: number): void;

  /**
   * Adds a message to a session's history
   * @param sessionId The session ID
   * @param message The message to add
   */
  addMessageToHistory(sessionId: string, message: ChatMessage): void;

  /**
   * Gets a session's message history
   * @param sessionId The session ID
   * @returns The session's message history or empty array if session not found
   */
  getHistory(sessionId: string): ChatMessage[];
}
