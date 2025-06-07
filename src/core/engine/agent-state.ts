// src/core/engine/agent-state.ts
import { BaseMessage } from '@langchain/core/messages';

export interface OpenWindowInfo {
    id: string;
    url: string;
    title?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export interface AgentState {
    messages: BaseMessage[];
    canvas: {
        windows: OpenWindowInfo[];
        // other canvas properties can be added here later
    };
}
