# LaserFocus Host

A Model Context Protocol (MCP) Host Server that enables real-time chat with an LLM, seamlessly integrating external tools.

## Features

- Real-time chat via WebSockets
- Integration with LLMs (initially Gemini)
- Tool discovery and execution via MCP servers
- Robust error handling and circuit breakers
- Streaming responses

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

1. Clone the repository

   ```bash
   git clone https://github.com/byOdysea/laserfocus-host.git
   cd laserfocus-host
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Configure environment variables

   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. Configure MCP servers in `mcp.json`

   ```json
   {
     "servers": {
       "filesystem": {
         "id": "filesystem",
         "type": "local",
         "transport": "stdio",
         "command": "npx",
         "args": ["@modelcontextprotocol/server-filesystem"],
         "timeoutMs": 10000
       }
     }
   }
   ```

5. Build the project

   ```bash
   npm run build
   ```

6. Start the server
   ```bash
   npm start
   ```

For development with auto-reload:

```bash
npm run dev
```

## Architecture

The MCP Host Server follows a modular architecture:

- **WebSocket Handler**: Manages bidirectional communication with frontend clients
- **Conversation Orchestrator**: Controls the chat flow and coordinates components
- **LLM Service**: Abstracts interactions with LLM providers
- **MCP Coordinator**: Manages connections to MCP servers and executes tools

## Configuration

### Environment Variables

- `GEMINI_API_KEY`: API key for Google Gemini
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: localhost)
- `LOG_LEVEL`: Logging level (default: info)
- `MCP_JSON_PATH`: Path to MCP configuration file (default: ./mcp.json)
- `MAX_TOKEN_COUNT`: Maximum token count for LLM context (default: 8192)
- `DEFAULT_TOOL_TIMEOUT_MS`: Default timeout for tool execution (default: 5000)

### MCP Server Configuration

The `mcp.json` file defines the MCP servers to connect to. Each server can use either `stdio` or `http` transport.

## API

### WebSocket Protocol

Connect to `/ws` endpoint. Messages follow these formats:

#### Client to Server

```json
{
  "type": "message",
  "payload": {
    "text": "Search for files containing 'example'"
  }
}
```

#### Server to Client

```json
{
  "type": "text",
  "payload": {
    "content": "I'll search for files containing 'example'"
  }
}
```

```json
{
  "type": "status",
  "payload": {
    "state": "processing",
    "tool": "search_files",
    "message": "Searching for files..."
  }
}
```

## License

This project is licensed under the ISC License.
