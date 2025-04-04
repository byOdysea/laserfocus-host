// src/types/mcp-sdk.d.ts
// Type declarations for the Model Context Protocol SDK

declare module '@modelcontextprotocol/sdk' {
  export interface ClientOptions {
    transport: 'stdio' | 'http';
    command?: string;
    args?: string[];
    url?: string;
  }

  export interface ToolsListResponse {
    tools: {
      name: string;
      description: string;
      parameters: Record<string, any>;
      examples?: Record<string, any>[];
    }[];
  }

  export interface PromptGetResponse {
    messages: {
      role: string;
      content: {
        type: string;
        text: string;
      };
    }[];
  }

  export interface CallToolOptions {
    signal?: AbortSignal;
  }

  export class Client {
    transport: string;

    constructor(options: ClientOptions);

    connect(): Promise<void>;
    disconnect(): Promise<void>;

    listTools(): Promise<ToolsListResponse>;
    getPrompt(name: string): Promise<PromptGetResponse>;
    callTool(name: string, args: Record<string, any>, options?: CallToolOptions): Promise<any>;
  }
}
