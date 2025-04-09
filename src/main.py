# src/main.py
# --- Application Entry Point ---
# Purpose: Initializes all core components and starts the WebSocket server.
# Changes:
# - Initial implementation.

import asyncio
import os
import sys
import traceback
from pathlib import Path

# Ensure the src directory is in the Python path if running from root
# This might not be needed depending on how you run it, but can help
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Load environment variables (from .env file at project root)
from dotenv import load_dotenv
load_dotenv(dotenv_path=project_root / '.env')

# Import core components
from src.core.gemini_adapter import GeminiAdapter
from src.core.llm_service import LLMService
from src.core.mcp_coordinator import MCPCoordinator
from src.core.orchestrator import ConversationOrchestrator
from src.handlers.websocket_handler import WebSocketHandler

# --- Configuration ---

# Base prompt - **MODIFIED FOR JARVIS PERSONA & ADDRESS**
BASE_SYSTEM_PROMPT = """
You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the AI assistant for Tony Stark.
When addressing him, use respectful but slightly familiar terms like "Sir," "Yes, Sir," or occasionally incorporating his name like "Right away, Tony," or "Understood, Sir Tony." Maintain a highly capable, helpful, and slightly witty tone overall.
You have access to external tools and memory systems.
Use these tools when necessary to fulfill requests accurately.
Follow the instructions precisely on how to format tool calls when you need to use them.
"""
# **END MODIFICATION**

# Path to MCP configuration (relative to project root)
MCP_CONFIG_PATH = str(project_root / "mcp.json")

# WebSocket Server Configuration
HOST = "localhost"
PORT = 8765 # Default WebSocket port, change if needed

async def main():
    """Initializes components and starts the server."""
    print("--- Starting Laserfocus Host ---")

    # 1. Load API Key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("CRITICAL ERROR: GEMINI_API_KEY environment variable not set.")
        print("Please create a .env file in the project root or set the variable.")
        return

    # 2. Initialize LLM Adapter and Service
    try:
        print("Initializing LLM Components...")
        adapter = GeminiAdapter(api_key=api_key)
        llm_service = LLMService(adapter=adapter, base_system_prompt=BASE_SYSTEM_PROMPT)
        print("LLM Components Initialized.")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to initialize LLM components: {e}")
        traceback.print_exc()
        return

    # 3. Initialize MCP Coordinator (using async with for proper lifecycle)
    try:
        # MCPCoordinator handles its own initialization logging internally
        async with MCPCoordinator(config_path=MCP_CONFIG_PATH) as mcp_coordinator:
            print("MCP Coordinator Context Entered.")

            # 4. Initialize Orchestrator
            print("Initializing Conversation Orchestrator...")
            orchestrator = ConversationOrchestrator(
                llm_service=llm_service,
                mcp_coordinator=mcp_coordinator # Pass the initialized coordinator
            )
            print("Conversation Orchestrator Initialized.")

            # 5. Initialize WebSocket Handler
            print("Initializing WebSocket Handler...")
            handler = WebSocketHandler(orchestrator=orchestrator)
            print("WebSocket Handler Initialized.")

            # 6. Start WebSocket Server
            await handler.start_server(host=HOST, port=PORT)

    except FileNotFoundError:
         print(f"CRITICAL ERROR: MCP config file not found at '{MCP_CONFIG_PATH}'.")
    except ValueError as e:
         # Catch config loading errors from MCPCoordinator
         print(f"CRITICAL ERROR: Failed to load or validate MCP config: {e}")
    except RuntimeError as e:
         # Catch TaskGroup or Client init errors
         print(f"CRITICAL ERROR: Runtime error during initialization: {e}")
         traceback.print_exc()
    except Exception as e:
        print(f"CRITICAL ERROR: An unexpected error occurred: {e}")
        traceback.print_exc()
    finally:
         print("--- Laserfocus Host Shutting Down ---")


if __name__ == "__main__":
    # Handle potential policy issues on Windows for asyncio
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped manually.")
    except Exception as e:
         # Catch errors during asyncio.run itself if any occur outside main()
         print(f"Fatal error during asyncio execution: {e}")
         traceback.print_exc()
