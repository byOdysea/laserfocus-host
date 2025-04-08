# src/handlers/websocket_handler.py
# --- Layer: WebSocket Handler ---
# Purpose: Manages WebSocket connections, routes messages to the orchestrator,
#          and streams responses back to the client.
# Changes:
# - Initial implementation using the 'websockets' library.

import asyncio
import json
import uuid
import traceback
from typing import Dict, Set, Optional

# Use 'websockets' library for handling WebSocket connections
# pip install websockets
import websockets
from websockets.server import WebSocketServerProtocol
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError

# Import core components and types
from src.core.orchestrator import ConversationOrchestrator
from src.core.llm_service import (
    LLMResponsePart,
    TextChunk,
    ToolCallIntent,
    ErrorInfo,
    EndOfTurn,
    LLMConfig # If we want to pass config from client someday
)

class WebSocketHandler:
    """Handles WebSocket communication with frontend clients."""

    def __init__(self, orchestrator: ConversationOrchestrator):
        """
        Initializes the WebSocketHandler.

        Args:
            orchestrator: An instance of ConversationOrchestrator.
        """
        if not isinstance(orchestrator, ConversationOrchestrator):
            raise TypeError("orchestrator must be an instance of ConversationOrchestrator")
        self.orchestrator = orchestrator
        # Keep track of active connections and their associated session IDs
        self._connections: Dict[WebSocketServerProtocol, str] = {}
        self._sessions: Dict[str, WebSocketServerProtocol] = {}

    async def _register_connection(self, websocket: WebSocketServerProtocol) -> str:
        """Registers a new connection and generates a session ID."""
        session_id = str(uuid.uuid4())
        self._connections[websocket] = session_id
        self._sessions[session_id] = websocket
        print(f"Handler: Connection registered with Session ID: {session_id}")
        return session_id

    async def _unregister_connection(self, websocket: WebSocketServerProtocol):
        """Unregisters a connection upon disconnection."""
        if websocket in self._connections:
            session_id = self._connections.pop(websocket)
            if session_id in self._sessions:
                del self._sessions[session_id]
            print(f"Handler: Connection unregistered for Session ID: {session_id}")
        else:
            print("Handler: Attempted to unregister an unknown connection.")

    def _format_response_part(self, part: LLMResponsePart) -> Optional[Dict]:
        """Formats an LLMResponsePart into a JSON serializable dict for the client."""
        payload: Optional[Dict] = None
        if isinstance(part, TextChunk):
            payload = {"type": "text", "payload": {"content": part.content}}
        elif isinstance(part, ToolCallIntent):
            # Send a status update indicating tool use is starting
            # The actual result comes later if the orchestrator feeds it back
            payload = {
                "type": "status",
                "payload": {
                    "state": "processing",
                    "tool": part.tool_name,
                    "message": f"Attempting to use tool: {part.tool_name}",
                    "arguments": part.arguments # Send args for potential display/debug
                }
            }
        elif isinstance(part, ErrorInfo):
            payload = {
                "type": "error",
                "payload": {
                    "message": part.message,
                    "details": part.details # Include details if present
                }
            }
        elif isinstance(part, EndOfTurn):
             payload = {"type": "end", "payload": {}} # Simple end signal

        return payload

    async def handle_connection(self, websocket: WebSocketServerProtocol):
        """Handles a single WebSocket connection lifecycle."""
        session_id = await self._register_connection(websocket)
        try:
            # Send initial connection confirmation (optional)
            await websocket.send(json.dumps({
                "type": "connection",
                "payload": {"state": "connected", "sessionId": session_id}
            }))

            # --- Main message loop for this connection ---
            async for message_str in websocket:
                print(f"Handler ({session_id}): Received message: {message_str[:100]}...") # Log truncated message
                try:
                    message = json.loads(message_str)
                    msg_type = message.get("type")
                    payload = message.get("payload")

                    if msg_type == "message" and payload and "text" in payload:
                        user_text = payload["text"]
                        print(f"Handler ({session_id}): Processing user text: {user_text[:100]}...")

                        # TODO: Allow passing LLMConfig from client if needed
                        llm_config = LLMConfig({}) # Empty config for now

                        # Call the orchestrator and stream results back
                        async for part in self.orchestrator.handle_input(
                            session_id=session_id,
                            text=user_text,
                            llm_config=llm_config
                        ):
                            formatted_payload = self._format_response_part(part)
                            if formatted_payload:
                                await websocket.send(json.dumps(formatted_payload))

                    # Add handlers for other message types (e.g., heartbeat ping/pong) if needed
                    elif msg_type == "ping":
                         await websocket.send(json.dumps({"type": "pong"}))
                    else:
                        print(f"Handler ({session_id}): Received unknown message type or format: {message}")
                        await websocket.send(json.dumps({
                            "type": "error",
                            "payload": {"message": "Unknown message type or format."}
                        }))

                except json.JSONDecodeError:
                    print(f"Handler ({session_id}): Received invalid JSON.")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "payload": {"message": "Invalid JSON received."}
                    }))
                except Exception as e:
                    # Catch errors during message processing or orchestration
                    error_details = traceback.format_exc()
                    print(f"Handler ({session_id}): Error processing message: {e}\n{error_details}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "payload": {"message": f"Server error: {e}", "details": error_details}
                    }))
                    # Depending on severity, we might break the loop or continue

        except (ConnectionClosedOK, ConnectionClosedError) as e:
            print(f"Handler ({session_id}): Connection closed ({type(e).__name__}).")
        except Exception as e:
            # Catch errors related to the connection itself
            print(f"Handler ({session_id}): Unhandled connection error: {e}")
            traceback.print_exc()
        finally:
            await self._unregister_connection(websocket)

    async def start_server(self, host: str, port: int):
        """Starts the WebSocket server."""
        print(f"Starting WebSocket server on ws://{host}:{port}...")
        async with websockets.serve(self.handle_connection, host, port):
            await asyncio.Future() # Run forever
