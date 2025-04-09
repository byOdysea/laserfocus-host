# src/cli_client.py
# --- Simple Async WebSocket CLI Client ---
# Purpose: Connects to the Laserfocus Host WebSocket server and allows interaction.
# Changes:
# - Fixed color rendering and proper handling of end signals
# - Improved prompt and output formatting to ensure clear separation
# - Restored indented JARVIS response style
# - Fixed initial input prompt alignment
# - Made status messages more subtle for fluidity
# - Added processing indicator (with delay)

import asyncio
import websockets
import json
import threading
import queue
from rich.console import Console
from rich.text import Text
from rich.status import Status
from typing import Optional

# Server configuration
SERVER_HOST = "localhost"
SERVER_PORT = 8765
SERVER_URI = f"ws://{SERVER_HOST}:{SERVER_PORT}"
PROCESSING_INDICATOR_DELAY = 1.75 # Seconds before showing indicator

# Shared variables
input_queue = queue.Queue()
exit_flag = threading.Event()
console = Console()
is_processing = False # Flag to track if LLM is thinking (request sent, no response yet)
processing_status: Optional[Status] = None # Holds the *visible* rich status object
indicator_timer_task: Optional[asyncio.Task] = None # Task for delayed indicator start

# --- Helper to start the visible indicator ---
async def show_processing_indicator():
    global processing_status, is_processing
    # Only show if we are still waiting for a response
    if is_processing:
        # Ensure no duplicate status exists
        if processing_status:
            processing_status.stop()
        processing_status = console.status("[bold yellow]Processing...", spinner="dots")
        processing_status.start()

# --- Input Thread (Needs slight adjustment for status interaction) ---
def input_thread_function():
    global processing_status # Only need processing_status here now
    try:
        while not exit_flag.is_set():
            # If the visible status is active, briefly stop it for input echo
            if processing_status:
                processing_status.stop()

            user_input = input() # Get input

            # If the visible status was stopped, restart it
            if processing_status:
                processing_status.start()

            input_queue.put(user_input)
            if user_input.lower() == 'quit':
                break
    except Exception as e:
        if processing_status: processing_status.stop() # Stop status on error
        console.print(f"[bold red]Input error: {e}[/]")
    finally:
        if not exit_flag.is_set(): input_queue.put(None)

# --- WebSocket Message Receiver ---
async def receive_websocket_messages(websocket):
    global is_processing, processing_status, indicator_timer_task
    try:
        currently_speaking = False
        initial_prompt_printed = False

        while True:
            message_str = await websocket.recv()

            # --- Response received: Cancel timer & stop visible indicator ---
            if indicator_timer_task and not indicator_timer_task.done():
                indicator_timer_task.cancel()
                indicator_timer_task = None

            if processing_status:
                processing_status.stop()
                processing_status = None

            is_processing = False # Mark processing as complete
            # --- End indicator logic ---

            message = json.loads(message_str)
            msg_type = message.get("type")
            payload = message.get("payload", {})

            # --- Process message types (largely unchanged) ---
            if msg_type == "text":
                if not currently_speaking:
                    console.print()
                    console.print(Text("JARVIS:", style="bold cyan"))
                    currently_speaking = True
                console.print(Text(f"  {payload.get('content', '')}", style="cyan"), end="")

            elif msg_type == "status":
                if currently_speaking: console.print(); currently_speaking = False
                status_text = Text()
                status_text.append("\nSTATUS: ", style="bold yellow")
                status_text.append(payload.get('message', ''), style="yellow")
                console.print(status_text)
                if payload.get('tool'):
                     tool_text = Text()
                     tool_text.append("  Tool: ", style="bold yellow")
                     tool_text.append(payload.get('tool'), style="yellow")
                     console.print(tool_text)

            elif msg_type == "error":
                if currently_speaking: console.print(); currently_speaking = False
                error_text = Text()
                error_text.append("\nERROR: ", style="bold red")
                error_text.append(payload.get('message', 'Unknown error'), style="red")
                console.print(error_text)

            elif msg_type == "end":
                if currently_speaking: console.print(); currently_speaking = False
                console.print()
                console.print(Text(">>> ", style="bold green"), end="")

            elif msg_type == "connection":
                console.print()
                connection_text = Text()
                connection_text.append("Connected. Session ID: ", style="bold green")
                connection_text.append(payload.get('sessionId'), style="green")
                console.print(connection_text)
                if not initial_prompt_printed:
                    console.print()
                    console.print(Text(">>> ", style="bold green"), end="")
                    initial_prompt_printed = True

    # --- Exception Handling (ensure timer/status stopped) ---
    except websockets.exceptions.ConnectionClosed:
        if indicator_timer_task: indicator_timer_task.cancel()
        if processing_status: processing_status.stop()
        console.print("\nConnection closed by server.", style="bold red")
        exit_flag.set()
    except json.JSONDecodeError:
        if indicator_timer_task: indicator_timer_task.cancel()
        if processing_status: processing_status.stop()
        console.print("\nReceived invalid JSON from server.", style="bold red")
    except Exception as e:
        if indicator_timer_task: indicator_timer_task.cancel()
        if processing_status: processing_status.stop()
        console.print(f"\nError receiving messages: {e}", style="bold red")
        exit_flag.set()

# --- Main Application Logic ---
async def main():
    global is_processing, processing_status, indicator_timer_task
    console.print(f"Connecting to {SERVER_URI}...", style="bold")

    try:
        async with websockets.connect(SERVER_URI) as websocket:
            console.print("Connected!", style="bold green")

            input_thread = threading.Thread(target=input_thread_function)
            input_thread.daemon = True
            input_thread.start()

            receive_task = asyncio.create_task(receive_websocket_messages(websocket))

            while not exit_flag.is_set():
                try:
                    try:
                        user_input = input_queue.get(block=False)
                    except queue.Empty:
                        await asyncio.sleep(0.1)
                        continue

                    if user_input is None: break
                    if user_input.lower() == 'quit':
                        console.print("Disconnecting...", style="bold yellow")
                        break

                    # --- Start processing (request sent) & timer ---
                    is_processing = True
                    # Cancel previous timer if exists
                    if indicator_timer_task and not indicator_timer_task.done():
                        indicator_timer_task.cancel()
                    # Start new timer to show indicator after delay
                    indicator_timer_task = asyncio.create_task(
                        asyncio.sleep(PROCESSING_INDICATOR_DELAY),
                        name="IndicatorDelay" # Name for easier debugging if needed
                    )
                    # Add callback to show indicator IF timer completes successfully
                    indicator_timer_task.add_done_callback(
                        lambda task: asyncio.create_task(show_processing_indicator()) if not task.cancelled() else None
                    )
                    # --- Timer started ---

                    message_to_send = {"type": "message", "payload": {"text": user_input}}
                    await websocket.send(json.dumps(message_to_send))

                except Exception as e:
                    # Stop timer/status on send error
                    if indicator_timer_task: indicator_timer_task.cancel()
                    if processing_status: processing_status.stop()
                    is_processing = False
                    console.print(f"Error sending message: {e}", style="bold red")
                    break

            # --- Clean up ---
            exit_flag.set()
            if indicator_timer_task: indicator_timer_task.cancel()
            if processing_status: processing_status.stop()
            receive_task.cancel()
            try: await receive_task
            except asyncio.CancelledError: pass

            if input_thread.is_alive(): input_thread.join(timeout=1.0)

    except websockets.exceptions.InvalidURI:
        console.print(f"Error: Invalid WebSocket URI: {SERVER_URI}", style="bold red")
    except ConnectionRefusedError:
        console.print(f"Error: Connection refused. Is the server running at {SERVER_URI}?", style="bold red")
    except Exception as e:
        console.print(f"Error: {e}", style="bold red")
    finally:
        # Final cleanup check
        if indicator_timer_task and not indicator_timer_task.done(): indicator_timer_task.cancel()
        if processing_status: processing_status.stop()

    console.print("Disconnected.", style="bold yellow")

# --- Entry Point ---
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print()
        console.print("Client stopped manually.", style="bold yellow")
    finally:
        exit_flag.set()
