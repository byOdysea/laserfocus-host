# MCP Host Server: MVP Implementation Plan

## 1. Overview
This plan outlines the implementation of a Minimum Viable Product (MVP) for the MCP Host Server, focusing on real-time chat with an LLM (Gemini) and basic tool integration via MCP (using `server-memory` as an example). The server uses Node.js with TypeScript, Fastify for WebSocket handling, and the official MCP SDK, ensuring a performant and reliable foundation.

## 2. MVP Goals
- Enable real-time WebSocket communication between frontend and host.
- Stream LLM responses (Gemini) to the client.
- Execute a basic MCP tool (`server-memory`) via `stdio`.
- Handle errors with retries and fallback messages.

## 3. Technical Decisions
- **Language**: Node.js (v18.20.4) with TypeScript (v5.5.4).  
  - *Reason*: Node.js excels in real-time I/O (WebSocket, MCP clients) with its event-driven model, integrates natively with the TypeScript-based MCP SDK, and supports LLM SDKs like Gemini’s.  
  - *Alternatives*: Python (less efficient for real-time due to GIL), Go (overkill, lacks MCP SDK).  
- **Web Framework**: Fastify (v4.28.1) with `@fastify/websocket` (v10.0.1).  
  - *Reason*: Fastest Node.js framework, native WebSocket support, TypeScript-ready.  
  - *Alternatives*: Express (slower, more setup), Socket.IO (unnecessary abstraction).  
- **MCP SDK**: `@modelcontextprotocol/sdk` (latest).  
  - *Reason*: Official, reliable, TypeScript-native.  
  - *Alternatives*: Custom clients (redundant effort).  
- **LLM SDK**: `@google/generative-ai` (v0.17.1) for Gemini.  
  - *Reason*: Streaming support, JSON tool calls, Node.js compatibility.  
  - *Alternatives*: OpenAI (similar but Gemini specified), Anthropic (weaker tool support).  
- **Configuration**: `dotenv` (v16.4.5) for `.env`, `zod` (v3.23.8) for `mcp.json`.  
  - *Reason*: Standard secrets management, robust validation.  
  - *Alternatives*: YAML (less MCP-aligned).  
- **Testing**: Jest (v29.7.0) with `ts-jest` (v29.2.4).  
  - *Reason*: Node.js standard, TypeScript support, easy mocking.  
  - *Alternatives*: Mocha (more setup), manual (unreliable).  
- **Tool Format**: JSON blobs (e.g., `{ "tool": "search_files", "arguments": {"query": "notes"} }`).  
  - *Reason*: Matches MCP JSON-RPC, easy parsing, LLM-compatible.  
  - *Alternatives*: Tagged markup (complex parsing), natural language (ambiguous).  
- **Chat History**: In-memory array per WebSocket connection.  
  - *Reason*: Fast, simple, fits single-instance needs.  
  - *Alternatives*: Database (overkill), files (slow).  
- **Tool Execution**: Sequential within a chat turn.  
  - *Reason*: Simple, debuggable, sufficient for MVP.  
  - *Alternatives*: Parallel (complex, unnecessary).  
- **Error Handling**: 3 retries (1-second delay), fallback messages (e.g., “Tool unavailable”).  
  - *Reason*: Balances resilience and simplicity.  
  - *Alternatives*: Advanced backoff (too complex).

## 4. Implementation Phases

### Phase 1: Project Setup
- **Tasks**:  
  1. Initialize project: Run `npm init -y` and `npx tsc --init`, configure `tsconfig.json` with `target: ES2022`, `module: NodeNext`, `outDir: ./dist`, `rootDir: ./src`, `strict: true`.  
  2. Install dependencies: `npm install fastify@4.28.1 @fastify/websocket@10.0.1 @modelcontextprotocol/sdk @google/generative-ai@0.17.1 dotenv@16.4.5 zod@3.23.8`, `npm install -D typescript@5.5.4 @types/node@20.14.11 jest@29.7.0 ts-jest@29.2.4 @types/jest@29.5.12`.  
  3. Create structure: `src/app.ts` (Fastify setup), `src/server.ts` (entry point), `src/utils/config.ts` (config loader), `src/types/message.ts`, `src/types/mcp.ts`, `src/types/chat.ts` (types), `.env` with `GEMINI_API_KEY=your_key`, `MCP_JSON_PATH=./mcp.json`, `mcp.json` with `{ "servers": [{"id": "memory", "path": "path/to/server-memory", "transport": "stdio"}] }`.  
  4. Basic server in `src/server.ts`: 
    ```typescript
        import Fastify from 'fastify';
        const app = Fastify({ logger: true });
        app.listen({ port: 3000 }, (err) => {
        if (err) console.error(err);
        else console.log('Server running on port 3000');
        });
    ```
- **Validation**: Run `npx ts-node src/server.ts`, expect “Server running on port 3000” in console.

### Phase 2: WebSocket Handler
- **Tasks**:  
  1. Define types in `src/types/message.ts`: 
    ```typescript
    export type ClientMessage = { type: "message"; payload: { text: string } };
    export type ServerMessage =
  | { type: "text"; payload: { content: string } }
  | { type: "status"; payload: { state: "processing" | "complete"; tool?: string; message: string; data?: object } };
  ```  
  2. Implement `src/websocket/handler.ts`: 
    ```typescript
        import { FastifyInstance } from 'fastify';
        import websocketPlugin from '@fastify/websocket';
        export function setupWebSocket(app: FastifyInstance) {
        app.register(websocketPlugin);
        app.get('/ws', { websocket: true }, (connection) => {
            connection.socket.on('message', (data) => {
            const msg: ClientMessage = JSON.parse(data.toString());
            if (msg.type === 'message') {
                connection.socket.send(JSON.stringify({ type: 'text', payload: { content: `Echo: ${msg.payload.text}` } }));
            }
            });
            connection.socket.on('close', () => console.log('Client disconnected'));
        });
        }
    ```  
  3. Update `src/app.ts`: 
    ```typescript
        import { setupWebSocket } from './websocket/handler';
        export function createApp() {
        const app = Fastify({ logger: true });
        setupWebSocket(app);
        return app;
        }
    ```
  4. Update `src/server.ts` to use `createApp()`.  
  5. Test client in `tests/simple-client.js`: 
    ```typescript
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:3000/ws');
        ws.on('open', () => ws.send(JSON.stringify({ type: 'message', payload: { text: 'Hello' } })));
        ws.on('message', (data) => console.log(data.toString()));
    ```
- **Validation**: Run server, then `node tests/simple-client.js`, expect `{"type":"text","payload":{"content":"Echo: Hello"}}`.

### Phase 3: Conversation Orchestrator (Basic)
- **Tasks**:  
  1. Define `src/types/chat.ts`: 
    ```typescript
        export type Message = {
            role: 'user' | 'assistant' | 'system';
            content: string | object;
            tool_name?: string;
        };
    ```
  2. Implement `src/orchestrator/orchestrator.ts`: 
    ```typescript
        export class ConversationOrchestrator {
        private history: Message[] = [];
        async *handleInput(text: string): AsyncGenerator<ServerMessage> {
            this.history.push({ role: 'user', content: text });
            yield { type: 'text', payload: { content: `You said: ${text}` } };
            this.history.push({ role: 'assistant', content: `You said: ${text}` });
        }
        }
    ```  
  3. Update `src/websocket/handler.ts`: 
    ```typescript
        import { ConversationOrchestrator } from '../orchestrator/orchestrator';
        export function setupWebSocket(app: FastifyInstance) {
        app.get('/ws', { websocket: true }, (connection) => {
            const orchestrator = new ConversationOrchestrator();
            connection.socket.on('message', async (data) => {
            const msg: ClientMessage = JSON.parse(data.toString());
            if (msg.type === 'message') {
                for await (const response of orchestrator.handleInput(msg.payload.text)) {
                connection.socket.send(JSON.stringify(response));
                }
            }
            });
        });
        }
    ```
- **Validation**: Send `{ "type": "message", "payload": { "text": "Hi" } }`, expect `{"type":"text","payload":{"content":"You said: Hi"}}`.

### Phase 4: LLM Service Integration
- **Tasks**:  
  1. Define `src/llm/service.ts`: 
    ```typescript
        import { Message } from '../types/chat';
        import { ServerMessage } from '../types/message';
        export interface LLMService {
            generateResponse(history: Message[]): AsyncGenerator<ServerMessage>;
        }
    ```  
  2. Implement `src/llm/gemini.ts`: 
    ```typescript
        import { GoogleGenerativeAI } from '@google/generative-ai';
        import { LLMService } from './service';
        export class GeminiAdapter implements LLMService {
        private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        async *generateResponse(history: Message[]): AsyncGenerator<ServerMessage> {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const chat = model.startChat({ history: history.map(m => ({ role: m.role, parts: [{ text: JSON.stringify(m.content) }] })) });
            const result = await chat.sendMessageStream('');
            for await (const chunk of result.stream) {
            yield { type: 'text', payload: { content: chunk.text() } };
            }
        }
        }
    ```
  3. Update `src/orchestrator/orchestrator.ts`: 
    ```typescript
        import { GeminiAdapter } from '../llm/gemini';
        export class ConversationOrchestrator {
            private history: Message[] = [];
            private llm = new GeminiAdapter();
            async *handleInput(text: string): AsyncGenerator<ServerMessage> {
                this.history.push({ role: 'user', content: text });
                for await (const response of this.llm.generateResponse(this.history)) {
                yield response;
                if (response.type === 'text') this.history.push({ role: 'assistant', content: response.payload.content });
                }
            }
        }
    ```
- **Validation**: Send a message, expect streamed Gemini text responses.

### Phase 5: MCP Coordinator (Basic)
- **Tasks**:  
  1. Define `src/types/mcp.ts`:
    ```typescript
        export type ServerConfig = { id: string; path: string; transport: 'stdio' | 'http' };
        export type ToolDefinition = { name: string; description: string; parameters: object };
    ```
  2. Implement `src/mcp/coordinator.ts`: 
    ```typescript
        import { Client } from '@modelcontextprotocol/sdk';
        import { z } from 'zod';
        import { readFileSync } from 'fs';
        const configSchema = z.object({ servers: z.array(z.object({ id: z.string(), path: z.string(), transport: z.enum(['stdio', 'http']) })) });
        export class MCPCoordinator {
        private clients: Map<string, Client> = new Map();
        private tools: Map<string, ToolDefinition> = new Map();
        constructor(configPath: string) {
            const config = configSchema.parse(JSON.parse(readFileSync(configPath, 'utf-8')));
            const server = config.servers[0]; // Single server for MVP
            const client = new Client({ transport: server.transport, path: server.path });
            this.clients.set(server.id, client);
            this.loadTools(client);
        }
        private async loadTools(client: Client) {
            const tools = await client.listTools();
            tools.forEach((tool: any) => this.tools.set(tool.name, tool));
        }
        async executeTool(name: string, args: object): Promise<object> {
            const client = this.clients.get('memory')!;
            return client.callTool(name, args);
        }
        }
    ```
  3. Update `src/app.ts` to initialize `MCPCoordinator`.  
- **Validation**: Log `coordinator.tools`, confirm `server-memory` tools are listed.

### Phase 6: Tool Call Loop
- **Tasks**:  
  1. Update `src/llm/gemini.ts`: 
    ```typescript
        export class GeminiAdapter implements LLMService {
        async *generateResponse(history: Message[]): AsyncGenerator<ServerMessage> {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const prompt = 'Respond with text or a tool call as JSON: { "tool": "name", "arguments": {...} }';
            const chat = model.startChat({ history: [...history, { role: 'system', parts: [{ text: prompt }] }] });
            const result = await chat.sendMessageStream(history[history.length - 1].content as string);
            for await (const chunk of result.stream) {
            const text = chunk.text();
            try {
                const json = JSON.parse(text);
                if (json.tool) yield { type: 'status', payload: { state: 'processing', tool: json.tool, message: 'Calling tool' } };
                else yield { type: 'text', payload: { content: text } };
            } catch {
                yield { type: 'text', payload: { content: text } };
            }
            }
        }
        }
    ```
  2. Update `src/orchestrator/orchestrator.ts`: 
    ```typescript
        import { MCPCoordinator } from '../mcp/coordinator';
        export class ConversationOrchestrator {
        constructor(private coordinator: MCPCoordinator) {}
        async *handleInput(text: string): AsyncGenerator<ServerMessage> {
            this.history.push({ role: 'user', content: text });
            for await (const response of this.llm.generateResponse(this.history)) {
            yield response;
            if (response.type === 'status' && response.payload.tool) {
                const result = await this.coordinator.executeTool(response.payload.tool, (JSON.parse(response.payload.message) as any).arguments || {});
                this.history.push({ role: 'assistant', content: result, tool_name: response.payload.tool });
                yield { type: 'status', payload: { state: 'complete', tool: response.payload.tool, message: 'Tool executed', data: result } };
                for await (const followUp of this.llm.generateResponse(this.history)) yield followUp;
            } else if (response.type === 'text') {
                this.history.push({ role: 'assistant', content: response.payload.content });
            }
            }
        }
        }
    ```
- **Validation**: Send a message triggering a tool call, observe status updates and final response.

## 5. Next Steps
- Support multiple MCP servers.
- Enhance error handling with detailed logging (e.g., Pino).
- Add context pruning for chat history.

## 6. Best Practices
- Use `async/await` for all async operations.
- Validate all JSON inputs with `zod`.
- Write Jest tests for each phase (e.g., `tests/websocket.test.ts`).
- Keep functions small and single-purpose.