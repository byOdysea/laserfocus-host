"""
Defines the main LangGraph engine for LaserFocus.

This module orchestrates the agent's interaction with tools and manages the
application state, particularly for UI canvas updates. It highlights a key
design pattern: the separation of concerns between tool definition/execution
and state mutation.

**Division of Responsibilities for Canvas Updates:**

The interaction between `engine/src/tools/canvas.py`, this `main.py` graph,
and `engine/src/nodes/updateCanvas.py` (specifically `process_canvas_logic`)
is crucial for robust and deterministic UI updates:

1.  **`engine/src/tools/canvas.py` (Canvas Tools):**
    *   **Defines Agent Interface & Input Validation:** These tools (`add_component_to_canvas`,
      `update_canvas`, `clear_canvas`) define the contract for the agent (LLM).
      They specify tool names, descriptions, and argument schemas (often using
      Pydantic models like `AddComponentArgs`, `ComponentInput`). This layer
      performs initial validation of the agent's inputs. For example,
      Pydantic models within the tools handle `props` parsing (e.g., JSON string
      to dict) before data reaches `process_canvas_logic`.
    *   **Data Transformation & Structuring:** Tools take validated agent input and
      transform it into a standardized output format expected by
      `process_canvas_logic`.
      - `update_canvas_tool` returns: `{"canvas": {"components": [...]}}`
      - `add_component_to_canvas_tool` returns: `{"canvas": {"component": {...}}}`
      - `clear_canvas_tool` returns: `{"canvas": "clear"}`
      This consistency simplifies `process_canvas_logic`.
    *   **Encapsulation of Tool-Specific Pre-computation:** While current tools
      are simple, any complex, tool-specific logic or pre-computation (e.g.,
      checking a component registry) would reside here.
    *   **Adherence to Tool Abstraction:** These are standard LangChain/LangGraph
      tools – functions that take input and produce output.

2.  **`engine/src/main.py` (This File - Graph Orchestration):**
    *   **Agent (`generate_action` node):** Decides *what* to do (e.g., "add a
      calendar to the sidebar") and which tool to call with what arguments.
    *   **`ToolNode` (the 'tools_executor' node in the graph):** Executes the chosen
      canvas tool. The tool's output (the "request for change") is added to
      the state as a `ToolMessage`.
    *   **Conditional Routing (`should_run_canvas_processor`):** Directs the flow.
      If a canvas tool was called, the state (now including the `ToolMessage`
      from the canvas tool) is passed to the `canvas_processor` node.
      Otherwise (e.g., `get_weather`), the flow might bypass canvas processing
      and return to the agent.

3.  **`engine/src/nodes/updateCanvas.py` (`process_canvas_logic` function, run by `canvas_processor` node):**
    *   **Deterministic State Mutation:** This function takes the "request for change"
      (extracted from the `ToolMessage` and agent's original call details within
      the `EngineState`) and the current canvas state. It then performs the
      actual, definitive, and deterministic update to `EngineState.canvas`.
      It knows how to interpret the outputs of `add_component_to_canvas_tool`,
      `update_canvas_tool`, and `clear_canvas_tool` to correctly modify the
      `canvas` field in the `EngineState`.

**In essence:**
The tools in `engine/src/tools/canvas.py` prepare and standardize the agent's *intent* for a canvas change. The graph in `main.py` routes this intent. Finally, `process_canvas_logic` in `engine/src/nodes/updateCanvas.py` *applies* that intent to the actual application state. This separation ensures clarity, testability, and robust state management.
"""
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import AIMessage, BaseMessage
from typing import Dict, Any

from src.utils.types import EngineState
from src.nodes.generateAction import generate_action
from src.nodes.updateCanvas import process_canvas_logic # Import the new canvas logic
from src.tools import (
    get_weather,
    update_canvas as update_canvas_tool, # Alias to avoid name clash
    clear_canvas as clear_canvas_tool,   # Alias to avoid name clash
    add_component_to_canvas as add_component_to_canvas_tool # Alias
)

# All available tools for the agent
AGENT_TOOLS = [
    get_weather,
    update_canvas_tool,
    clear_canvas_tool,
    add_component_to_canvas_tool
]

def should_run_canvas_processor(state: EngineState) -> str:
    """
    Determines if the canvas_processor node should run based on the last tool call.
    """
    agent_decision_message: AIMessage | None = None
    # Iterate backwards to find the last AIMessage that might contain tool calls
    for i in range(len(state["messages"]) -1, -1, -1):
        msg = state["messages"][i]
        if isinstance(msg, AIMessage) and hasattr(msg, 'tool_calls') and msg.tool_calls:
            agent_decision_message = msg
            break # Found the most recent AIMessage with tool_calls

    if agent_decision_message:
        for tool_call in agent_decision_message.tool_calls:
            tool_name = tool_call.get("name", "")
            if tool_name in ["add_component_to_canvas", "update_canvas", "clear_canvas"]:
                return "run_canvas_processor" # Route to canvas processor
    
    return "skip_canvas_processor" # Otherwise, skip and go back to agent


# --- Graph Definition ---
laserfocus_engine = StateGraph(EngineState)

# Add nodes
laserfocus_engine.add_node("agent", generate_action)
laserfocus_engine.add_node("tools_executor", ToolNode(AGENT_TOOLS))
laserfocus_engine.add_node("canvas_processor", process_canvas_logic)

# Define edges
laserfocus_engine.add_edge(START, "agent")

# Conditional edge from agent: if tools are called, go to tools_executor, else end.
laserfocus_engine.add_conditional_edges(
    "agent",
    tools_condition, # LangGraph's built-in function to check for tool calls
    {
        "tools": "tools_executor",  # If tools_condition is "tools"
        "__end__": END              # If tools_condition is "__end__"
    }
)

# Conditional edge from tools_executor: decide if canvas_processor needs to run
laserfocus_engine.add_conditional_edges(
    "tools_executor",
    should_run_canvas_processor,
    {
        "run_canvas_processor": "canvas_processor",
        "skip_canvas_processor": "agent" # If non-canvas tool, pass result back to agent
    }
)

# After canvas_processor, always go back to agent
laserfocus_engine.add_edge("canvas_processor", "agent")

# Compile the graph
laserfocus_engine_graph = laserfocus_engine.compile()