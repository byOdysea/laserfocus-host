// Chat-related types
export interface ClientMessage {
  type: "message";
  payload: {
    text: string;
  };
}

export interface ConnectionMetadata {
  sessionId: string;
  clientId: string;
  connectedAt: number;
  lastActiveAt: number;
  userAgent?: string;
}

export type ServerMessage =
  | {
      type: "text";
      payload: {
        content: string;
      };
    }
  | {
      type: "status";
      payload: {
        state: "processing" | "complete";
        tool?: string;
        message: string;
        data?: object;
      };
    }
  | {
      type: "connection";
      payload: {
        state: "connected" | "reconnecting" | "error";
        message: string;
        sessionId: string;
      };
    };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content?: string;
  data?: any;
  createdAt: number;
  toolName?: string;
  kind?: "start" | "progress" | "complete";
  metadata?: Record<string, any>;
}
