# src/core/mcpCoordinator.py

from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
import json
import asyncio
import sys
import traceback
from pathlib import Path

from mcp import ClientSession, StdioServerParameters, types, Tool
from mcp.client.stdio import stdio_client

@dataclass
class ServerConfig:
    """Configuration for an MCP server."""
    name: str
    description: str
    type: str
    transport: str
    command: Optional[str] = None
    args: Optional[List[str]] = None
    url: Optional[str] = None
    env: Optional[Dict[str, str]] = None
    timeout_ms: int = 10000

@dataclass
class ToolRegistryEntry:
    """Entry in the tool registry."""
    qualified_name: str
    definition: types.Tool
    server_id: str
    client: ClientSession # Note: This client lives in a background task
    transport_type: str
    reliability: Dict[str, Any]
    performance: Dict[str, Any]

class MCPCoordinator:
    def __init__(self, config_path: str):
        """Initialize the MCP Coordinator."""
        self.config_path = Path(config_path)
        self.tool_registry: Dict[str, ToolRegistryEntry] = {}
        self.clients: Dict[str, ClientSession] = {} # Stores active client sessions
        # Note: _client_contexts is removed as contexts are managed within tasks now
        self._server_tasks: Dict[str, asyncio.Task] = {}
        self._tg: Optional[asyncio.TaskGroup] = None
        self._shutdown_event = asyncio.Event()
        # Circuit breaker settings (kept for potential future use)
        self.circuit_threshold = 5
        self.circuit_reset_time_ms = 60000

    async def _load_config(self) -> Dict[str, ServerConfig]:
        """Load and validate the mcp.json configuration."""
        print(f"Coordinator: Loading config from {self.config_path}...")
        try:
            with open(self.config_path) as f:
                raw_config = json.load(f)
            configs = {}
            for server_id, server_data in raw_config.get("servers", {}).items():
                server_data.pop('id', None)
                configs[server_id] = ServerConfig(**server_data)
            print(f"Coordinator: Config loaded for {len(configs)} servers.")
            return configs
        except Exception as e:
            print(f"Coordinator ERROR: Failed to load config: {e}")
            raise ValueError(f"Failed to load MCP configuration from {self.config_path}: {e}")

    async def _discover_tools_for_client(self, server_id: str, client: ClientSession, server_config: ServerConfig):
        """Discover and register tools for a specific client."""
        try:
            tools_result = await client.list_tools()
            tools = tools_result.tools if hasattr(tools_result, 'tools') else []
            count = 0
            for tool in tools:
                qualified_name = f"{server_id}:{tool.name}"
                self.tool_registry[qualified_name] = ToolRegistryEntry(
                    qualified_name=qualified_name,
                    definition=tool,
                    server_id=server_id,
                    client=client, # The client session managed by this task
                    transport_type=server_config.transport,
                    reliability={"success_count": 0, "failure_count": 0, "circuit_open": False, "last_failure": None},
                    performance={"avg_response_time_ms": 0, "call_count": 0, "last_used": None}
                )
                count += 1
            if count > 0:
                print(f"  - [{server_id}] Registered {count} tools.")
        except Exception as e:
            print(f"  - [{server_id}] ERROR during tool discovery: {e}")

    async def _manage_server_connection(self, server_id: str, server_config: ServerConfig, setup_event: asyncio.Event):
        """Dedicated task managing a single server connection lifecycle."""
        client_session_ref = None
        task_failed = False
        try:
            if server_config.transport == "stdio":
                if not server_config.command:
                    raise ValueError(f"Missing command for stdio server {server_id}")

                server_params = StdioServerParameters(
                    command=server_config.command,
                    args=server_config.args or [],
                    env=server_config.env or {},
                )

                async with stdio_client(server_params) as (read, write):
                    async with ClientSession(read, write) as session:
                        client_session_ref = session
                        await session.initialize()
                        self.clients[server_id] = session
                        await self._discover_tools_for_client(server_id, session, server_config)
                        setup_event.set()
                        await self._shutdown_event.wait()

            elif server_config.transport == "sse":
                print(f"[{server_id}] Warning: Unsupported transport 'sse'.")
                task_failed = True
                setup_event.set()
            
            else:
                 print(f"[{server_id}] Warning: Unknown transport '{server_config.transport}'.")
                 task_failed = True
                 setup_event.set()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[{server_id}] ERROR in server task: {e}")
            task_failed = True
            if not setup_event.is_set():
                setup_event.set()
        finally:
            if server_id in self.clients and self.clients.get(server_id) is client_session_ref:
                del self.clients[server_id]
            keys_to_delete = [key for key in self.tool_registry if key.startswith(f"{server_id}:")]
            for key in keys_to_delete:
                if key in self.tool_registry:
                     del self.tool_registry[key]

    async def initialize(self) -> None:
        """Initialize by launching server tasks and waiting for their setup."""
        print("Coordinator: Initializing...")
        config = await self._load_config()

        if not config:
            print("Coordinator: No servers defined.")
            return

        self._shutdown_event.clear()
        self._server_tasks.clear()
        setup_events: Dict[str, asyncio.Event] = {}
        wait_tasks_map: Dict[asyncio.Task, str] = {}

        if self._tg is None:
            raise RuntimeError("TaskGroup not initialized. MCPCoordinator must be used with 'async with'.")

        print(f"Coordinator: Launching {len(config)} server tasks...")
        for server_id, server_config in config.items():
            setup_event = asyncio.Event()
            setup_events[server_id] = setup_event
            server_task = self._tg.create_task(
                self._manage_server_connection(server_id, server_config, setup_event)
            )
            self._server_tasks[server_id] = server_task
            wait_task = asyncio.create_task(setup_event.wait(), name=f"wait_setup_{server_id}")
            wait_tasks_map[wait_task] = server_id

        setup_timeout = 30.0
        
        if not wait_tasks_map:
             return

        done, pending = await asyncio.wait(wait_tasks_map.keys(), timeout=setup_timeout)

        failed_servers = []
        successful_servers = []

        if pending:
            print(f"Coordinator WARNING: Server setup timed out for:")
            for wait_task in pending:
                server_id = wait_tasks_map.get(wait_task, "unknown_timeout")
                print(f"  - {server_id}")
                wait_task.cancel()
                failed_servers.append(server_id)
                if server_id != "unknown_timeout" and server_id in self._server_tasks:
                    self._server_tasks[server_id].cancel()
            
        for wait_task in done:
             server_id = wait_tasks_map.get(wait_task, "unknown_done")
             if wait_task.cancelled():
                 if server_id not in failed_servers: failed_servers.append(server_id)
             elif wait_task.exception():
                  exc = wait_task.exception()
                  print(f"Coordinator ERROR: Waiting for {server_id} setup failed: {exc}")
                  if server_id not in failed_servers: failed_servers.append(server_id)
                  if server_id in self._server_tasks: self._server_tasks[server_id].cancel()
             else:
                  successful_servers.append(server_id)

        print("\n--- Coordinator Initialization Summary ---")
        if successful_servers:
            print("Successfully Initialized Servers:")
            for server_id in sorted(successful_servers):
                 print(f"  - {server_id}")
        if failed_servers:
            print("Failed/Timeout Servers:")
            for server_id in sorted(failed_servers):
                 print(f"  - {server_id}")
        if not successful_servers and not failed_servers:
             print("No servers were processed.")
        print("----------------------------------------")

    async def call_tool(self, qualified_tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Calls a registered tool by its qualified name."""
        if qualified_tool_name not in self.tool_registry:
            raise ValueError(f"Tool '{qualified_tool_name}' not found in registry.")
        
        tool_entry = self.tool_registry[qualified_tool_name]
        client = tool_entry.client
        tool_name = tool_entry.definition.name
        
        try:
            result = await client.call_tool(tool_name, arguments=arguments)
            return result
        except Exception as e:
            print(f"Coordinator ERROR: Calling tool '{qualified_tool_name}' failed: {e}")
            raise

    # --- Context Manager Implementation ---
    async def __aenter__(self):
        """Enter the coordinator context, creating task group and initializing."""
        self._tg = asyncio.TaskGroup()
        await self._tg.__aenter__()
        try:
            await self.initialize()
        except Exception as init_exc:
             print(f"Coordinator ERROR: Initialization failed: {init_exc}. Exiting context early.")
             self._shutdown_event.set()
             await self._tg.__aexit__(type(init_exc), init_exc, init_exc.__traceback__)
             self._tg = None
             raise
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit the coordinator context, cleaning up resources."""
        if self._tg is None:
            return

        self._shutdown_event.set()

        exit_result = False
        try:
            exit_result = await self._tg.__aexit__(exc_type, exc_val, exc_tb)
        except Exception as tg_exit_exc:
             print(f"Coordinator ERROR: Exception during TaskGroup exit: {tg_exit_exc}")

        self.clients.clear()
        self.tool_registry.clear()
        self._server_tasks.clear()
        self._tg = None

            