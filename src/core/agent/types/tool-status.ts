/**
 * Tool execution status types and interfaces
 */

export type ToolStatus = 'executing' | 'completed' | 'error';

export interface ToolStatusUpdate {
    toolName: string;
    status: ToolStatus;
    timestamp?: string;
    metadata?: Record<string, any>;
}

export interface ToolStatusCallback {
    (update: ToolStatusUpdate): void;
}

export interface ConversationUpdate {
    type: 'user' | 'agent' | 'agent-stream' | 'agent-stream-start' | 'agent-stream-end' | 'agent-thinking' | 'tool-call' | 'tool-status' | 'agent-stream-error';
    content: string;
    timestamp?: string;
    status?: ToolStatus;
    metadata?: Record<string, any>;
}

/**
 * Tool execution observer interface for status tracking
 */
export interface ToolExecutionObserver {
    onToolStart(toolName: string, args: Record<string, any>): void;
    onToolComplete(toolName: string, result: any): void;
    onToolError(toolName: string, error: Error): void;
}

/**
 * Status formatter utilities
 */
export class ToolStatusFormatter {
    static formatStatusMessage(toolName: string, status: ToolStatus): string {
        return `🔧_status:${toolName}:${status}`;
    }

    static parseStatusMessage(message: string): ToolStatusUpdate | null {
        if (!message.startsWith('🔧_status:')) {
            return null;
        }

        const parts = message.split(':');
        if (parts.length !== 3) {
            return null;
        }

        return {
            toolName: parts[1],
            status: parts[2] as ToolStatus,
            timestamp: new Date().toISOString()
        };
    }

    static isStatusMessage(message: string): boolean {
        return message.startsWith('��_status:');
    }
} 