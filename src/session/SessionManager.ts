import { Session } from "../types/core";

export interface SessionManager {
  createSession(metadata?: object): string;
  getSession(sessionId: string): Session | null;
  addConnectionToSession(sessionId: string, connectionId: string): void;
  removeConnectionFromSession(sessionId: string, connectionId: string): void;
  getAllSessions(): Session[];
  cleanupInactiveSessions(maxAgeMs: number): void;
}
