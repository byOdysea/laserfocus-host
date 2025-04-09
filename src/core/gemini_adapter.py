# src/core/gemini_adapter.py
# --- Layer: LLM Adapter ---
# Purpose: Implements the LLMAdapter protocol for Google Gemini models.
#          Handles API communication using the NEW google-genai SDK.
# Changes:
# - FINAL FIX 4: Map internal 'tool' role to 'user' role for API history,
#   as 'function' role is invalid in this context.

from google import genai
from google.genai import types as genai_types
from google.api_core import exceptions as google_exceptions
import traceback
import json
import asyncio
from typing import (
    Any,
    AsyncGenerator,
    Dict,
    List,
    Optional,
    cast,
    Generator
)
from functools import partial

# Import necessary types and protocol from llm_service
# Use relative import if they are in the same package/directory structure
from .llm_service import LLMAdapter, LLMConfig, ChatMessage

# Default model (using user preference)
DEFAULT_MODEL_NAME = "gemini-2.0-flash-thinking-exp-01-21"

# Note: Safety settings cannot be passed to stream method currently
DEFAULT_SAFETY_SETTINGS_DICT = {
    'HARASSMENT': 'BLOCK_MEDIUM_AND_ABOVE',
    'HATE_SPEECH': 'BLOCK_MEDIUM_AND_ABOVE',
    'SEXUALLY_EXPLICIT': 'BLOCK_MEDIUM_AND_ABOVE',
    'DANGEROUS_CONTENT': 'BLOCK_MEDIUM_AND_ABOVE',
}

# Sentinel object to signal the end of the sync generator
_SENTINEL = object()

class GeminiAdapter(LLMAdapter):
    """
    LLMAdapter implementation for Google Gemini, using the google-genai SDK.
    NOTE: Due to apparent limitations/signature of generate_content_stream,
    per-call configuration for temp, tokens, safety, system_instruction
    is currently NOT applied for streaming calls. Relies on defaults.
    System prompt is prepended to the 'contents' list.
    Tool results are mapped to the 'user' role for history context.
    """

    def __init__(
        self,
        api_key: str,
        default_model_name: str = DEFAULT_MODEL_NAME,
        default_safety_settings: Optional[Dict[str, str]] = None,
    ):
        """Initializes the Gemini Adapter using google.genai.Client."""
        self._default_model_name = default_model_name
        self._default_safety_settings_dict = default_safety_settings if default_safety_settings is not None else DEFAULT_SAFETY_SETTINGS_DICT

        try:
            self._client = genai.Client(api_key=api_key)
            print(f"google-genai Client initialized successfully (using model default: {self._default_model_name}).")
        except Exception as e:
             print(f"Error initializing google-genai Client: {e}")
             raise RuntimeError(f"Failed to initialize google-genai Client: {e}") from e

    def _format_contents_for_gemini(
        self,
        system_prompt: Optional[str],
        history: List[ChatMessage]
        ) -> List[genai_types.ContentDict]:
        """
        Converts system prompt and history into the google-genai ContentDict list format.
        Prepends system prompt as first user message with synthetic model response.
        Maps internal 'tool' role messages to 'user' role for API compatibility.
        """
        contents: List[genai_types.ContentDict] = []

        if system_prompt and system_prompt.strip():
            contents.append(genai_types.ContentDict(role="user", parts=[genai_types.PartDict(text=system_prompt)]))
            contents.append(genai_types.ContentDict(role="model", parts=[genai_types.PartDict(text="Understood. I will follow these instructions.")]))

        last_role = "model" if contents else None

        for message in history:
            role = message['role']
            content = message.get('content')
            data = message.get('data')
            tool_name = message.get('tool_name') # Get tool name for context

            mapped_role: Optional[str] = None
            parts: List[genai_types.PartDict] = []

            if role == 'assistant':
                 mapped_role = 'model'
                 if content is not None and isinstance(content, str):
                      parts.append(genai_types.PartDict(text=content))
            elif role == 'user':
                 mapped_role = 'user'
                 if content is not None and isinstance(content, str):
                      parts.append(genai_types.PartDict(text=content))
            elif role == 'tool':
                 # Map 'tool' role to 'user' role and format the data clearly
                 mapped_role = 'user'
                 if data is not None:
                      if isinstance(data, str): part_content = data
                      else:
                           try: part_content = json.dumps(data, indent=2)
                           except Exception: part_content = str(data)
                      # Add context that this is a tool result
                      tool_context = f"Result for tool '{tool_name}':\n" if tool_name else "Tool Result:\n"
                      parts.append(genai_types.PartDict(text=f"{tool_context}{part_content}"))
            else:
                continue # Skip other roles

            if not parts or not mapped_role:
                 continue # Skip if no parts generated or role couldn't be mapped

            # Prevent adding consecutive identical roles if possible
            if mapped_role == last_role:
                 # If consecutive user messages, merge parts? Or skip? For now, append.
                 if mapped_role == 'user' and contents:
                     print(f"Warning: Appending consecutive 'user' role messages.")
                     # Option: Merge parts into previous user message if possible
                     # contents[-1]['parts'].extend(parts) # Simple merge (might break structure)
                     # Continue with appending for now:
                     contents.append(genai_types.ContentDict(role=mapped_role, parts=parts))
                     last_role = mapped_role
                 else:
                     # Avoid other consecutive roles like model/model
                      print(f"Warning: Skipping message to avoid consecutive roles: Role='{mapped_role}'")
                      continue
            else:
                 contents.append(genai_types.ContentDict(role=mapped_role, parts=parts))
                 last_role = mapped_role

        return contents

    # Helper function to safely get next item or sentinel
    def _safe_next(self, sync_generator: Generator) -> Any:
        """Calls next() on the generator, returning _SENTINEL on StopIteration."""
        try:
            return next(sync_generator)
        except StopIteration:
            return _SENTINEL
        except Exception as e:
             print(f"Error during sync generator next() call: {e}")
             raise

    async def _iterate_sync_generator_async(self, sync_generator: Generator) -> AsyncGenerator[Any, None]:
        """Wraps a synchronous generator in an async one using run_in_executor."""
        loop = asyncio.get_running_loop()
        func = partial(self._safe_next, sync_generator)
        while True:
            try:
                next_item = await loop.run_in_executor(None, func)
                if next_item is _SENTINEL: break
                else: yield next_item
            except Exception as e:
                print(f"Error iterating sync generator in executor: {e}")
                raise

    async def stream_generate(
        self,
        prompt_and_history: Dict[str, Any],
        config: LLMConfig
    ) -> AsyncGenerator[str, None]:
        """
        Streams raw text chunks from the Gemini API using the new google-genai SDK.
        NOTE: Calls generate_content_stream with ONLY model and contents arguments.
        """
        if not self._client:
             raise RuntimeError("google-genai Client not initialized.")

        try:
            system_prompt_text = prompt_and_history.get("system_prompt")
            history = prompt_and_history.get("history", [])
            formatted_contents = self._format_contents_for_gemini(system_prompt_text, history)

            if not formatted_contents:
                 print("Warning: formatted_contents list is empty after processing history/prompt. Skipping API call.")
                 return

            model_name_to_use = config.get('model_name', self._default_model_name)
            if not model_name_to_use.startswith("models/"):
                 model_name_for_api = f"models/{model_name_to_use}"
            else:
                 model_name_for_api = model_name_to_use

            request_args: Dict[str, Any] = {
                "model": model_name_for_api,
                "contents": formatted_contents,
            }

            print(f"Calling generate_content_stream (sync) with args: {list(request_args.keys())}")
            # print(f"Contents being sent:\n{json.dumps(formatted_contents, indent=2)}") # Debug

            sync_response_iterator = self._client.models.generate_content_stream(**request_args)

            async for chunk in self._iterate_sync_generator_async(sync_response_iterator):
                 try:
                      if hasattr(chunk, 'text') and chunk.text:
                           yield chunk.text
                      elif chunk.parts:
                           chunk_text = "".join(part.text for part in chunk.parts if hasattr(part, 'text'))
                           if chunk_text:
                                yield chunk_text
                 except ValueError:
                       print(f"Warning: Skipping chunk due to ValueError (likely blocked content).")
                       continue
                 except AttributeError:
                      print(f"Warning: Skipping chunk due to AttributeError (unexpected structure): {chunk}")
                      continue

        except google_exceptions.GoogleAPIError as e:
            print(f"Gemini API Error ({type(e).__name__}): {e}")
            print(f"Request model: {request_args.get('model')}")
            print(f"Request contents length: {len(request_args.get('contents', []))}")
            # print roles only: print(f"Request contents roles: {[c.get('role') for c in request_args.get('contents', [])]}")

            if isinstance(e, google_exceptions.PermissionDenied):
                 print("Error: Check your API key and permissions.")
            elif isinstance(e, google_exceptions.InvalidArgument):
                 print(f"Error: Invalid argument passed to Gemini API: {e}")
            raise ConnectionError(f"Gemini API request failed: {e}") from e
        except Exception as e:
            print(f"Unexpected error in GeminiAdapter stream_generate: {e}\n{traceback.format_exc()}")
            raise RuntimeError(f"GeminiAdapter failed: {e}") from e
