from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from src.utils.types import EngineState
from src.nodes.generateAction import generate_action
from src.nodes.updateCanvas import update_canvas
from src.tools import (
    get_weather,
    generate_email_data,
    generate_calendar_data,
    generate_todo_data,
    generate_notes_data,
    generate_reminders_data
)

# --- Graph Definition ---
laserfocus_engine = StateGraph(EngineState)

# All available tools for the ToolNode
tools = [
    get_weather,
    generate_email_data,
    generate_calendar_data,
    generate_todo_data,
    generate_notes_data,
    generate_reminders_data
]

# Add nodes
# laserfocus_engine.add_node("initialize_engine", initialize_engine)
laserfocus_engine.add_node("generate_action", generate_action)
laserfocus_engine.add_node("update_canvas", update_canvas)
laserfocus_engine.add_node("execute_tool", ToolNode(tools))

# Define edges
# laserfocus_engine.add_edge(START, "initialize_engine")  # Start with initialization
laserfocus_engine.add_edge(START, "generate_action")
laserfocus_engine.add_conditional_edges(
    "generate_action",
    lambda state: "execute_tool" if hasattr(state["messages"][-1], 'tool_calls') and state["messages"][-1].tool_calls else "end",
    {
        "execute_tool": "execute_tool",
        "end": END
    }
)
laserfocus_engine.add_edge("execute_tool", "update_canvas")
laserfocus_engine.add_edge("update_canvas", "generate_action")  # Generate more actions if needed

# Compile the graph
laserfocus_engine_graph = laserfocus_engine.compile()