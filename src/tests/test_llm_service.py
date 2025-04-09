# src/tests/test_llm_service.py
# Purpose: Test script for LLMService using GeminiAdapter.
# Changes:
# - Initial creation.
# - Corrected imports to use 'src.core' instead of just 'core'.

import asyncio
import os
import traceback
from typing import List, Dict, Any

# Load environment variables (for API key)
# Ensure you have a .env file in the project root with GEMINI_API_KEY=...
# or set the environment variable manually.
# pip install python-dotenv
from dotenv import load_dotenv

load_dotenv()

# Import from our core modules using the 'src' package name
from src.core.llm_service import (
    LLMService,
    ChatMessage,
    ToolDefinition,
    LLMConfig,
    LLMResponsePart,
    TextChunk,
    ToolCallIntent,
    ErrorInfo
)
from src.core.gemini_adapter import GeminiAdapter

# --- Test Configuration ---

# Base prompt instructing the LLM - **MODIFIED FOR JARVIS PERSONA & ADDRESS**
BASE_SYSTEM_PROMPT = """
You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the AI assistant for Tony Stark.
When addressing him, use respectful but slightly familiar terms like "Sir," "Yes, Sir," or occasionally incorporating his name like "Right away, Tony," or "Understood, Sir Tony." Maintain a highly capable, helpful, and slightly witty tone overall.
You have access to external tools and memory systems.
Use these tools when necessary to fulfill requests accurately.
Follow the instructions precisely on how to format tool calls when you need to use them.
"""
# **END MODIFICATION**

# Sample tools mimicking data from MCPCoordinator registry
SAMPLE_TOOL_DEFINITIONS: List[ToolDefinition] = [
    {
        "qualified_name": "memory:search_nodes",
        "server_id": "memory",
        "description": "Searches for entities (nodes) in memory based on a query string.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query."},
                "entity_type": {"type": "string", "description": "(Optional) Filter by entity type."}
            },
            "required": ["query"]
        }
    },
    {
        "qualified_name": "filesystem:read_file",
        "server_id": "filesystem",
        "description": "Reads the content of a file at a given path.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "The full path to the file."}
            },
            "required": ["path"]
        }
    }
]

# Sample LLM config for the request (optional overrides)
SAMPLE_LLM_CONFIG: LLMConfig = {
    "temperature": 0.7,
    # "model_name": "gemini-1.5-pro-latest" # Example override
}

async def main():
    print("--- LLM Service Test ---")

    # 1. Get API Key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.")
        print("Please create a .env file in the project root or set the variable.")
        return

    # 2. Initialize Adapter and Service
    try:
        print("Initializing GeminiAdapter...")
        # Using default model specified in gemini_adapter.py
        adapter = GeminiAdapter(api_key=api_key)
        print("Initializing LLMService...")
        llm_service = LLMService(adapter=adapter, base_system_prompt=BASE_SYSTEM_PROMPT)
        print("Initialization complete.")
    except Exception as e:
        print(f"Error during initialization: {e}")
        traceback.print_exc()
        return

    # 3. Simulate Conversation
    print("\n--- Simulating Conversation ---")
    history: List[ChatMessage] = [
        {"role": "user", "content": "JARVIS, search my memory for notes about project 'Alpha'."} # Modified user prompt slightly for persona
    ]
    print(f"User: {history[0]['content']}")

    max_turns = 3
    current_turn = 0

    while current_turn < max_turns:
        current_turn += 1
        print(f"\n--- Turn {current_turn} ---")
        print("Assistant:") # This will be J.A.R.V.I.S. speaking

        last_response_was_tool_call = False
        assistant_response_content = ""

        try:
            async for part in llm_service.generate_response(
                history=history,
                tool_definitions=SAMPLE_TOOL_DEFINITIONS,
                config=SAMPLE_LLM_CONFIG
            ):
                if isinstance(part, TextChunk):
                    print(part.content, end="", flush=True)
                    assistant_response_content += part.content
                elif isinstance(part, ToolCallIntent):
                    print(f"\n[TOOL CALL DETECTED]")
                    print(f"  Tool Name: {part.tool_name}")
                    print(f"  Arguments: {part.arguments}")
                    last_response_was_tool_call = True

                    # --- Simulate Orchestrator Action ---
                    if assistant_response_content:
                         history.append({
                              "role": "assistant",
                              "content": assistant_response_content,
                              "data": None,
                              "tool_name": None
                         })
                         print(f"\n[ASSISTANT TEXT ADDED TO HISTORY]")

                    tool_result_data_to_add: Dict[str, Any]
                    if part.tool_name == "memory:search_nodes":
                         tool_result_data_to_add = {
                              "entities_found": [{"name": "Alpha Project Notes", "type": "Note"}, {"name": "Alpha Project Meeting Minutes", "type": "Minutes"}],
                              "status": "success"
                         }
                    else:
                         tool_result_data_to_add = {"status": "simulated_success", "message": f"Tool '{part.tool_name}' executed."}

                    history.append({
                        "role": "tool",
                        "tool_name": part.tool_name,
                        "data": tool_result_data_to_add,
                        "content": None
                    })
                    print(f"[SIMULATED TOOL RESULT ADDED TO HISTORY]")

                    break

                elif isinstance(part, ErrorInfo):
                    print(f"\n[ERROR RECEIVED]: {part.message}")
                    if part.details:
                        print(f"  Details: {part.details}")
                    break

            print()

            if not last_response_was_tool_call:
                 if assistant_response_content:
                     history.append({
                         "role": "assistant",
                         "content": assistant_response_content,
                         "data": None,
                         "tool_name": None
                     })
                 print("\n--- End of Assistant Turn (No Tool Call) ---")
                 break

        except Exception as e:
            print(f"\nError during LLM generation or processing: {e}")
            traceback.print_exc()
            break

    print("\n--- Conversation Simulation Finished ---")
    print("\nFinal History:")
    import json
    print(json.dumps(history, indent=2))


if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
