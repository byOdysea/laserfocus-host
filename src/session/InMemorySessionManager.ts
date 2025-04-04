// src/session/InMemorySessionManager.ts
// Implementation of Session Management using an in-memory store for the MVP
// Changes: Fixed logger import to use default export

import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, Session } from '../types';
import logger from '../utils/logger';
import { SessionManager } from './SessionManager';

/**
 * In-memory implementation of the SessionManager interface for MVP
 */
export class InMemorySessionManager implements SessionManager {
  private sessions = new Map<string, Session>();
  private connectionToSession = new Map<string, string>();

  /**
   * Creates a new session with optional metadata
   * @param metadata Optional metadata to associate with the session
   * @returns The session ID
   */
  createSession(metadata: Record<string, any> = {}): string {
    const sessionId = uuidv4();
    const now = Date.now();

    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: now,
      lastActiveAt: now,
      connectionId: '', // Will be populated when a connection is added
      history: [],
      metadata,
    });

    logger.debug({ sessionId }, 'Session created');
    return sessionId;
  }

  /**
   * Gets a session by ID
   * @param sessionId The session ID
   * @returns The session or null if not found
   */
  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.debug({ sessionId }, 'Session not found');
      return null;
    }

    // Update last active timestamp
    session.lastActiveAt = Date.now();
    return session;
  }

  /**
   * Adds a connection to a session
   * @param sessionId The session ID
   * @param connectionId The connection ID
   */
  addConnectionToSession(sessionId: string, connectionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn({ sessionId, connectionId }, 'Cannot add connection to non-existent session');
      return;
    }

    // For MVP, we only support a single connection per session
    // If there's already a connection, replace it
    if (session.connectionId) {
      // Remove old mapping
      this.connectionToSession.delete(session.connectionId);
      logger.debug(
        { sessionId, oldConnectionId: session.connectionId, newConnectionId: connectionId },
        'Replacing existing connection for session',
      );
    }

    // Update session with new connection
    session.connectionId = connectionId;
    session.lastActiveAt = Date.now();

    // Map connection to session for quick lookups
    this.connectionToSession.set(connectionId, sessionId);

    logger.debug({ sessionId, connectionId }, 'Connection added to session');
  }

  /**
   * Removes a connection from a session
   * @param sessionId The session ID
   * @param connectionId The connection ID
   */
  removeConnectionFromSession(sessionId: string, connectionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(
        { sessionId, connectionId },
        'Cannot remove connection from non-existent session',
      );
      return;
    }

    // Only remove if it matches the current connection
    if (session.connectionId === connectionId) {
      session.connectionId = '';
      this.connectionToSession.delete(connectionId);
      logger.debug({ sessionId, connectionId }, 'Connection removed from session');
    } else {
      logger.warn(
        { sessionId, connectionId, currentConnectionId: session.connectionId },
        'Connection ID mismatch when removing from session',
      );
    }
  }

  /**
   * Gets all active sessions
   * @returns Array of all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Cleans up inactive sessions older than the specified age
   * @param maxAgeMs Maximum age in milliseconds
   */
  cleanupInactiveSessions(maxAgeMs: number): void {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    // Find stale sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActiveAt > maxAgeMs) {
        staleSessionIds.push(sessionId);
      }
    }

    // Remove stale sessions and their connection mappings
    for (const sessionId of staleSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && session.connectionId) {
        this.connectionToSession.delete(session.connectionId);
      }
      this.sessions.delete(sessionId);
    }

    if (staleSessionIds.length > 0) {
      logger.info({ count: staleSessionIds.length }, 'Cleaned up stale sessions');
    }
  }

  /**
   * Adds a message to a session's history
   * @param sessionId The session ID
   * @param message The message to add
   */
  addMessageToHistory(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn({ sessionId }, 'Cannot add message to non-existent session');
      return;
    }

    session.history.push(message);
    session.lastActiveAt = Date.now();

    logger.debug(
      {
        sessionId,
        messageId: message.id,
        messageRole: message.role,
        messageType: message.kind || 'text',
      },
      'Message added to session history',
    );
  }

  /**
   * Gets a session's message history
   * @param sessionId The session ID
   * @returns The session's message history or empty array if session not found
   */
  getHistory(sessionId: string): ChatMessage[] {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.debug({ sessionId }, 'Cannot get history for non-existent session');
      return [];
    }

    return [...session.history];
  }

  /**
   * Gets the session ID associated with a connection ID
   * @param connectionId The connection ID
   * @returns The session ID or null if not found
   */
  getSessionIdByConnectionId(connectionId: string): string | null {
    return this.connectionToSession.get(connectionId) || null;
  }
}
