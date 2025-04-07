import { ChatMessage } from "./chat";

export interface Session {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  connectionId: string;
  history: ChatMessage[];
  metadata: object;
}

export interface RequestContext {
  requestId: string;
  sessionId: string;
  parentRequestId?: string;
  startTime: number;
  traceId: string;
  labels: Record<string, string>;
}
