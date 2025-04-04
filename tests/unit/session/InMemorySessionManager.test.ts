// tests/unit/session/InMemorySessionManager.test.ts
// Unit tests for the in-memory session manager implementation
// Changes: Fixed timer test with proper Date.now mocking

import { InMemorySessionManager } from '../../../src/session';
import { ChatMessage } from '../../../src/types';

// Mock the logger to avoid console output during tests
jest.mock('../../../src/utils/logger', () => {
  return {
    __esModule: true,
    default: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
});

describe('InMemorySessionManager', () => {
  let sessionManager: InMemorySessionManager;

  beforeEach(() => {
    sessionManager = new InMemorySessionManager();
  });

  describe('createSession', () => {
    it('should create a session with a unique ID', () => {
      const sessionId = sessionManager.createSession();
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should store metadata with the session', () => {
      const metadata = { userId: 'user123', clientInfo: 'browser' };
      const sessionId = sessionManager.createSession(metadata);
      const session = sessionManager.getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session?.metadata).toEqual(metadata);
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      expect(session).toBeNull();
    });

    it('should return the session for valid ID', () => {
      const sessionId = sessionManager.createSession();
      const session = sessionManager.getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId);
    });

    it('should update lastActiveAt timestamp when retrieving a session', () => {
      // Mock Date.now directly
      const originalDateNow = Date.now;
      const startTime = 1000000;

      try {
        // First set it to a fixed value
        Date.now = jest.fn(() => startTime);

        const sessionId = sessionManager.createSession();
        const session1 = sessionManager.getSession(sessionId);
        expect(session1!.lastActiveAt).toBe(startTime);

        // Now change the mock to return a later time
        Date.now = jest.fn(() => startTime + 5000);

        const session2 = sessionManager.getSession(sessionId);
        expect(session2!.lastActiveAt).toBe(startTime + 5000);
      } finally {
        // Restore original Date.now
        Date.now = originalDateNow;
      }
    });
  });

  describe('addConnectionToSession', () => {
    it('should add a connection to a session', () => {
      const sessionId = sessionManager.createSession();
      const connectionId = 'conn123';

      sessionManager.addConnectionToSession(sessionId, connectionId);
      const session = sessionManager.getSession(sessionId);

      expect(session?.connectionId).toBe(connectionId);
    });

    it('should replace existing connection if already present', () => {
      const sessionId = sessionManager.createSession();
      const oldConnectionId = 'conn123';
      const newConnectionId = 'conn456';

      sessionManager.addConnectionToSession(sessionId, oldConnectionId);
      sessionManager.addConnectionToSession(sessionId, newConnectionId);

      const session = sessionManager.getSession(sessionId);
      expect(session?.connectionId).toBe(newConnectionId);
    });

    it('should not throw error for non-existent session', () => {
      expect(() => {
        sessionManager.addConnectionToSession('non-existent', 'conn123');
      }).not.toThrow();
    });
  });

  describe('removeConnectionFromSession', () => {
    it('should remove a connection from a session', () => {
      const sessionId = sessionManager.createSession();
      const connectionId = 'conn123';

      sessionManager.addConnectionToSession(sessionId, connectionId);
      sessionManager.removeConnectionFromSession(sessionId, connectionId);

      const session = sessionManager.getSession(sessionId);
      expect(session?.connectionId).toBe('');
    });

    it('should not remove connection if ID does not match', () => {
      const sessionId = sessionManager.createSession();
      const connectionId = 'conn123';

      sessionManager.addConnectionToSession(sessionId, connectionId);
      sessionManager.removeConnectionFromSession(sessionId, 'different-conn');

      const session = sessionManager.getSession(sessionId);
      expect(session?.connectionId).toBe(connectionId);
    });

    it('should not throw error for non-existent session', () => {
      expect(() => {
        sessionManager.removeConnectionFromSession('non-existent', 'conn123');
      }).not.toThrow();
    });
  });

  describe('getAllSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = sessionManager.getAllSessions();
      expect(sessions).toEqual([]);
    });

    it('should return all sessions', () => {
      const sessionId1 = sessionManager.createSession();
      const sessionId2 = sessionManager.createSession();

      const sessions = sessionManager.getAllSessions();
      expect(sessions.length).toBe(2);
      expect(sessions.map((s) => s.id).sort()).toEqual([sessionId1, sessionId2].sort());
    });
  });

  describe('cleanupInactiveSessions', () => {
    let originalDateNow: () => number;

    beforeEach(() => {
      originalDateNow = Date.now;
      Date.now = jest.fn(() => 1000000);
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    it('should remove sessions older than the specified age', () => {
      // Create sessions
      const sessionId1 = sessionManager.createSession();
      const sessionId2 = sessionManager.createSession();

      // Simulate session 1 being inactive for 30 minutes
      const session1 = sessionManager.getSession(sessionId1);
      if (session1) {
        session1.lastActiveAt = 1000000 - 30 * 60 * 1000;
      }

      // Clean up sessions older than 15 minutes
      sessionManager.cleanupInactiveSessions(15 * 60 * 1000);

      // Only session 2 should remain
      expect(sessionManager.getSession(sessionId1)).toBeNull();
      expect(sessionManager.getSession(sessionId2)).not.toBeNull();
    });

    it('should handle connection cleanup when removing sessions', () => {
      const sessionId = sessionManager.createSession();
      const connectionId = 'conn123';

      sessionManager.addConnectionToSession(sessionId, connectionId);

      // Make session stale
      const session = sessionManager.getSession(sessionId);
      if (session) {
        session.lastActiveAt = 1000000 - 30 * 60 * 1000;
      }

      // Clean up
      sessionManager.cleanupInactiveSessions(15 * 60 * 1000);

      // Session should be gone
      expect(sessionManager.getSession(sessionId)).toBeNull();

      // getSessionIdByConnectionId should return null
      expect(sessionManager.getSessionIdByConnectionId(connectionId)).toBeNull();
    });
  });

  describe('addMessageToHistory', () => {
    it('should add a message to the session history', () => {
      const sessionId = sessionManager.createSession();
      const message: ChatMessage = {
        id: 'msg123',
        role: 'user',
        content: 'Hello, world!',
        createdAt: Date.now(),
      };

      sessionManager.addMessageToHistory(sessionId, message);

      const history = sessionManager.getHistory(sessionId);
      expect(history.length).toBe(1);
      expect(history[0]).toEqual(message);
    });

    it('should not throw error for non-existent session', () => {
      expect(() => {
        sessionManager.addMessageToHistory('non-existent', {
          id: 'msg123',
          role: 'user',
          content: 'Hello, world!',
          createdAt: Date.now(),
        });
      }).not.toThrow();
    });
  });

  describe('getHistory', () => {
    it('should return empty array for non-existent session', () => {
      const history = sessionManager.getHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('should return the history for a session with messages', () => {
      const sessionId = sessionManager.createSession();
      const message1: ChatMessage = {
        id: 'msg123',
        role: 'user',
        content: 'Hello',
        createdAt: Date.now(),
      };
      const message2: ChatMessage = {
        id: 'msg456',
        role: 'assistant',
        content: 'Hi there',
        createdAt: Date.now(),
      };

      sessionManager.addMessageToHistory(sessionId, message1);
      sessionManager.addMessageToHistory(sessionId, message2);

      const history = sessionManager.getHistory(sessionId);
      expect(history.length).toBe(2);
      expect(history).toEqual([message1, message2]);
    });

    it('should return a copy of the history, not the original array', () => {
      const sessionId = sessionManager.createSession();
      const message: ChatMessage = {
        id: 'msg123',
        role: 'user',
        content: 'Hello',
        createdAt: Date.now(),
      };

      sessionManager.addMessageToHistory(sessionId, message);

      const history = sessionManager.getHistory(sessionId);
      // Modify the returned array
      history.push({
        id: 'msg456',
        role: 'assistant',
        content: 'Modified outside',
        createdAt: Date.now(),
      });

      // Original history should not be modified
      const freshHistory = sessionManager.getHistory(sessionId);
      expect(freshHistory.length).toBe(1);
    });
  });

  describe('getSessionIdByConnectionId', () => {
    it('should return null for non-existent connection', () => {
      const sessionId = sessionManager.getSessionIdByConnectionId('non-existent');
      expect(sessionId).toBeNull();
    });

    it('should return the session ID for a valid connection', () => {
      const sessionId = sessionManager.createSession();
      const connectionId = 'conn123';

      sessionManager.addConnectionToSession(sessionId, connectionId);

      const retrievedSessionId = sessionManager.getSessionIdByConnectionId(connectionId);
      expect(retrievedSessionId).toBe(sessionId);
    });
  });
});
