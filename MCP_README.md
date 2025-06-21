# LaserFocus MCP Server

LaserFocus provides a Model Context Protocol (MCP) server that enables AI agents to control native macOS web view windows remotely. The server follows the official [MCP 2025-06-18 specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/index.md) and implements proper JSON-RPC 2.0 protocol for maximum compatibility.

## Quick Start

### For Athena Integration (Recommended)

1. **Start Athena Docker Container**:
   ```bash
   docker-compose up -d athena  # Athena runs persistently
   ```

2. **Configure LaserFocus for Athena**:
   ```bash
   export ATHENA_URL="http://localhost:3000"
   ```

3. **Launch LaserFocus**: 
   ```bash
   open -a LaserFocus  # App announces itself to Athena
   ```

4. **Athena Auto-Discovery**: Athena now knows LaserFocus tools are available

### For Standalone Mode

1. **Launch LaserFocus**: Server runs on `http://localhost:8080/mcp`
2. **Connect Directly**: Manual client connection to the endpoint

## Architecture Overview

```
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│     Athena AI       │  ←──  │  Service Registry   │  ←──  │   LaserFocus App    │
│  (Docker Container) │       │   (Athena Managed)  │       │    (Native macOS)   │
│                     │       │                     │       │                     │
│ • LangGraph Agent   │       │ • Tool Discovery    │       │ • MCP Server        │
│ • Auto-discovers    │       │ • Health Monitoring │       │ • Tool Provider     │
│ • Uses tools        │       │ • Connection Mgmt   │       │ • Auto-registration │
└─────────────────────┘       └─────────────────────┘       └─────────────────────┘
```

### Standalone Mode
- Simple HTTP JSON-RPC server on port 8080
- Direct client connections to `http://localhost:8080/mcp`
- Manual endpoint management

### Athena Integration Mode 🆕 (Recommended)
- **Tool Provider Registration**: LaserFocus announces its availability to Athena
- **Persistent Athena**: Athena runs continuously in Docker container
- **Dynamic Discovery**: Athena automatically discovers LaserFocus tools
- **Health Monitoring**: LaserFocus reports status every 30 seconds
- **Fault Tolerance**: Auto-reconnection if Docker restarts

## Athena Integration

When you set the `ATHENA_URL` environment variable, LaserFocus automatically announces itself as a tool provider to your persistent Athena Docker container:

### Tool Provider Registration
LaserFocus calls Athena's registration endpoint to announce availability:

```http
POST {ATHENA_URL}/athena/mcp/servers/register
Content-Type: application/json

{
  "name": "laserfocus",
  "url": "http://localhost:8080/mcp",
  "type": "webview_tools",
  "status": "ready",
  "capabilities": ["open_window", "close_window"],
  "metadata": {
    "version": "1.0.0",
    "platform": "macOS",
    "protocol": "mcp-2025-06-18"
  }
}
```

### Status Reporting
Every 30 seconds, LaserFocus reports its status to Athena:

```http
POST {ATHENA_URL}/athena/mcp/servers/health
Content-Type: application/json

{
  "name": "laserfocus",
  "status": "alive",
  "timestamp": "2025-06-20T20:04:49Z",
  "windows_count": 3
}
```

### Tool Unavailability Notification
When LaserFocus quits, it notifies Athena that tools are no longer available:

```http
POST {ATHENA_URL}/athena/mcp/servers/unregister
Content-Type: application/json

{
  "name": "laserfocus"
}
```

## Python Integration Examples

### Using with LangGraph + MCP Python SDK

Here's a complete example of integrating LaserFocus with a LangGraph agent:

#### 1. Installation

```bash
pip install mcp langgraph langchain-core httpx
```

#### 2. MCP Tool Wrapper

```python
import asyncio
import httpx
from typing import Dict, Any, List, Optional
from langchain_core.tools import BaseTool
from langchain_core.callbacks import CallbackManagerForToolRun
from pydantic import BaseModel, Field
from mcp import ClientSession
from mcp.client.base import ClientTransport
from mcp.client.http import HttpTransport
from langgraph import create_react_agent

class MCPHTTPTransport(ClientTransport):
    """HTTP transport for MCP client"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')
        self.client = httpx.AsyncClient()
    
    async def send_request(self, request: dict) -> dict:
        async with self.client as client:
            response = await client.post(
                f"{self.base_url}/mcp",
                json=request,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return response.json()

class LaserFocusTool(BaseTool):
    """LangChain tool wrapper for LaserFocus MCP tools"""
    
    name: str
    description: str
    mcp_tool_name: str
    session: ClientSession
    
    def _run(self, run_manager: Optional[CallbackManagerForToolRun] = None, **kwargs) -> str:
        """Execute the tool synchronously"""
        return asyncio.run(self._arun(**kwargs))
    
    async def _arun(self, **kwargs) -> str:
        """Execute the tool asynchronously"""
        try:
            # Call the MCP tool
            result = await self.session.call_tool(self.mcp_tool_name, kwargs)
            
            if result.isError:
                return f"Error: {result.content[0].text if result.content else 'Unknown error'}"
            
            # Return the result content
            return result.content[0].text if result.content else "Success"
        
        except Exception as e:
            return f"Error calling {self.mcp_tool_name}: {str(e)}"

async def create_laserfocus_tools(mcp_url: str = "http://localhost:8080") -> List[BaseTool]:
    """Create LangChain tools from LaserFocus MCP server"""
    
    # Create MCP client session
    transport = MCPHTTPTransport(mcp_url)
    session = ClientSession(transport)
    
    try:
        # Initialize MCP session
        await session.initialize()
        
        # Get available tools from MCP server
        tools_response = await session.list_tools()
        
        # Convert MCP tools to LangChain tools
        langchain_tools = []
        
        for mcp_tool in tools_response.tools:
            tool = LaserFocusTool(
                name=mcp_tool.name,
                description=mcp_tool.description,
                mcp_tool_name=mcp_tool.name,
                session=session
            )
            
            # Add input schema if available
            if hasattr(mcp_tool, 'inputSchema') and mcp_tool.inputSchema:
                # Convert MCP schema to Pydantic model
                properties = mcp_tool.inputSchema.get('properties', {})
                
                class DynamicArgs(BaseModel):
                    pass
                
                # Dynamically add fields based on MCP schema
                for prop_name, prop_info in properties.items():
                    field_type = str  # Default to string
                    if prop_info.get('type') == 'integer':
                        field_type = int
                    elif prop_info.get('type') == 'number':
                        field_type = float
                    elif prop_info.get('type') == 'boolean':
                        field_type = bool
                    
                    DynamicArgs.__annotations__[prop_name] = field_type
                    setattr(DynamicArgs, prop_name, Field(
                        description=prop_info.get('description', '')
                    ))
                
                tool.args_schema = DynamicArgs
            
            langchain_tools.append(tool)
        
        return langchain_tools
    
    except Exception as e:
        print(f"Error creating LaserFocus tools: {e}")
        return []

# Example usage with LangGraph
async def create_web_agent():
    """Create a LangGraph agent with LaserFocus tools"""
    
    # Get LaserFocus tools
    tools = await create_laserfocus_tools()
    
    if not tools:
        print("No LaserFocus tools available")
        return None
    
    # Create the agent with a language model
    # Note: Replace with your preferred LLM (OpenAI, Anthropic, etc.)
    from langchain_openai import ChatOpenAI
    
    llm = ChatOpenAI(model="gpt-4", temperature=0)
    
    # Create the agent
    agent = create_react_agent(
        model=llm,
        tools=tools,
        system_message="""You are a helpful assistant that can control web browser windows on macOS.
        
        Available tools:
        - open_window: Open a new web browser window with a URL
        - close_window: Close a specific web browser window
        
        When opening windows, always provide:
        - url: The website URL to open
        - title: A descriptive title for the window
        - width/height: Reasonable dimensions (default: 1200x800)
        
        Be helpful and ask for clarification if needed."""
    )
    
    return agent

# Example usage
async def main():
    # Create the agent
    agent = await create_web_agent()
    
    if agent is None:
        print("Failed to create agent")
        return
    
    # Example conversation
    response = await agent.ainvoke({
        "messages": [
            {"role": "user", "content": "Open GitHub in a new window"}
        ]
    })
    
    print("Agent response:", response)

# Run the example
if __name__ == "__main__":
    asyncio.run(main())
```

#### 4. Production Setup

**Athena (Docker Container - Always Running):**
```yaml
# docker-compose.yml
version: '3.8'

services:
  athena:
    build: .
    ports:
      - "3000:3000"  # Expose for LaserFocus registration
    environment:
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
    restart: unless-stopped  # Keep Athena running
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge
```

**LaserFocus (Native macOS App):**
```bash
# Set Athena URL for tool registration
export ATHENA_URL="http://localhost:3000"

# Launch LaserFocus - it will automatically announce tools to Athena
open -a LaserFocus
```

**Workflow:**
1. 🐳 **Start Athena**: `docker-compose up -d athena`
2. 🍎 **Launch LaserFocus**: App auto-registers with Athena
3. 🤖 **Athena Discovers Tools**: Can now use LaserFocus capabilities
4. 🔄 **Continuous Operation**: Health monitoring keeps connection alive

## Available Tools

### Core MCP Methods

#### `initialize`
Server handshake with capability negotiation.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {"name": "Client", "version": "1.0.0"}
  }
}
```

#### `tools/list`
Lists available tools with their schemas.

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "open_window",
        "description": "Opens a web view window with specified URL, title, and dimensions",
        "inputSchema": {
          "type": "object",
          "properties": {
            "url": {"type": "string", "description": "The URL to load"},
            "title": {"type": "string", "default": "LaserFocus Web"},
            "width": {"type": "number", "default": 800, "minimum": 300},
            "height": {"type": "number", "default": 600, "minimum": 200}
          },
          "required": ["url"]
        }
      }
    ]
  }
}
```

#### `tools/call`
Executes a tool with specified arguments.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "open_window",
    "arguments": {
      "url": "https://github.com",
      "title": "GitHub",
      "width": 1200,
      "height": 800
    }
  }
}
```

#### `resources/list`
Lists available resources.

#### `resources/read`
Reads resource content by URI.

### 1. `open_window`
Opens a new WKWebView window with the specified URL.

**Parameters:**
- `url` (required): The URL to load in the web view
- `title` (optional): Window title (default: "LaserFocus Web")  
- `width` (optional): Window width in pixels (default: 800, min: 300)
- `height` (optional): Window height in pixels (default: 600, min: 200)

**Returns:**
- Success message with window ID
- Error message if URL is invalid

### 2. `close_window`
Closes a specific web window by its UUID.

**Parameters:**
- `window_id` (required): The UUID string of the window to close

**Returns:**
- Success message confirming closure
- Error message if window not found

## Available Resources

### 1. `laserfocus://windows`
**Content-Type**: `application/json`  
**Description**: JSON list of currently open web view windows

**Schema:**
```json
[
{
    "id": "12345-67890-abcdef",
    "url": "https://github.com",
    "title": "GitHub",
    "width": 1200,
    "height": 800
  }
]
```

### 2. `laserfocus://help`
**Content-Type**: `text/markdown`  
**Description**: Complete help documentation for LaserFocus MCP tools

## Configuration

### Environment Variables

- `ATHENA_URL`: Enable Athena integration (e.g., `http://localhost:3000`)
- `MCP_PORT`: Override default port 8080 (not yet implemented)
- `MCP_LOG_LEVEL`: Set logging level (not yet implemented)

### Athena Server Requirements

Your Athena server should implement these endpoints:

- `POST /athena/mcp/servers/register` - Server registration
- `POST /athena/mcp/servers/unregister` - Server unregistration  
- `POST /athena/mcp/servers/health` - Health updates
- `GET /athena/mcp/servers` - List registered servers

## Troubleshooting

### Athena Integration Issues

1. **Registration Failed**: Check `ATHENA_URL` and ensure Athena server is running
2. **Health Check Errors**: Normal during development - indicates network issues
3. **Auto-Reconnection**: LaserFocus will attempt to re-register automatically

### Connection Issues

#### "Connection Refused"
- Verify LaserFocus app is running
- Check port 8080 isn't blocked by firewall
- Ensure Docker has host network access

#### "Invalid JSON-RPC"
- Verify Content-Type is `application/json`
- Check JSON syntax and required fields
- Ensure `jsonrpc: "2.0"` is included

#### "Method Not Found"
- Use exact method names: `tools/list`, `tools/call`, etc.
- Check spelling and case sensitivity

## Technical Implementation

The LaserFocus MCP server implementation includes:

- **HTTP JSON-RPC 2.0 Server**: Custom implementation using Swift Network framework
- **MCP 2025-06-18 Compliance**: Follows official specification exactly  
- **Dynamic Service Registration**: Production-ready Athena integration
- **Actor-based Concurrency**: Swift 6 compatible with proper isolation
- **Comprehensive Error Handling**: Standard JSON-RPC error codes
- **Cross-platform Architecture**: Designed for Docker ↔ macOS communication

### Architecture Benefits

✅ **Service Discovery**: Dynamic server registration and health monitoring  
✅ **Fault Tolerance**: Auto-reconnection and graceful degradation  
✅ **Production Ready**: Proper error handling and logging  
✅ **Cross-Container**: Works seamlessly between Docker and native macOS  
✅ **Standards Compliant**: Full MCP and JSON-RPC 2.0 compatibility

## References

- [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/)
- [MCP Swift SDK](https://github.com/modelcontextprotocol/swift-sdk)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Swift Concurrency](https://docs.swift.org/swift-book/LanguageGuide/Concurrency.html)

---

*This implementation provides a production-ready MCP server that enables seamless integration between containerized AI agents and native macOS web view capabilities.* 