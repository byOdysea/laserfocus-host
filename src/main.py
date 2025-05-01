from typing import (
    Annotated,
    Sequence,
    TypedDict,
)
from langchain_core.messages import BaseMessage
from langchain_core.tools import tool
import json
from langchain_core.messages import ToolMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, END 
from langchain_mcp_adapters.client import MultiServerMCPClient
import os
from contextlib import asynccontextmanager
from langchain_google_genai import ChatGoogleGenerativeAI
import aiofiles

class AgentState(TypedDict):
    """The state of the agent."""
    messages: Annotated[Sequence[BaseMessage], add_messages]

model = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    temperature=0
)

@asynccontextmanager
async def create_jarvis_graph():
    script_dir = os.path.dirname(__file__)
    mcp_config_path = os.path.join(script_dir, '..', 'mcp.json')
    if not os.path.exists(mcp_config_path):
        raise FileNotFoundError(f"MCP config file not found at: {mcp_config_path}")

    try:
        async with aiofiles.open(mcp_config_path, mode='r') as f:
            content = await f.read()
            config_dict = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Error decoding MCP JSON config from {mcp_config_path}: {e}")
    except Exception as e:
        raise RuntimeError(f"Error reading MCP config file {mcp_config_path}: {e}")

    async with MultiServerMCPClient(config_dict) as mcp_client:
        mcp_tools = mcp_client.get_tools() 

        @tool
        def get_weather(location: str):
            """Gets the current weather for a specified location."""
            if "beijing" in location.lower():
                return "The weather in Beijing is sunny."
            elif "new york" in location.lower():
                return "The weather in New York is cloudy."
            else:
                return f"Weather information for {location} is not available."

        manual_tools = [get_weather]

        all_tools = manual_tools + mcp_tools
        model_with_tools = model.bind_tools(all_tools) 
        tools_by_name = {tool.name: tool for tool in all_tools}

        async def tool_node(state: AgentState):
            outputs = []
            last_message = state["messages"][-1]

            if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
                # If the model decides not to call a tool, we can just return
                # Or let the model continue generating
                # Depending on the desired behavior
                return {"messages": []} # Or potentially pass control back to the model node

            for tool_call in last_message.tool_calls:
                tool_name = tool_call["name"]
                if tool_name in tools_by_name:
                    selected_tool = tools_by_name[tool_name]
                    try:
                        # Await the asynchronous tool invocation
                        output = await selected_tool.ainvoke(tool_call["args"])
                        outputs.append(ToolMessage(content=str(output), tool_call_id=tool_call["id"]))
                    except Exception as e:
                        # Handle potential errors during tool invocation
                        error_message = f"Error invoking tool {tool_name}: {e}"
                        print(error_message) # Log the error
                        # Append an error message or a specific ToolMessage indicating failure
                        outputs.append(ToolMessage(content=error_message, tool_call_id=tool_call["id"]))
                else:
                    # Handle case where the tool name is not found
                    error_message = f"Tool '{tool_name}' not found."
                    print(error_message)
                    outputs.append(ToolMessage(content=error_message, tool_call_id=tool_call["id"]))

            return {"messages": outputs}

        def call_model(state: AgentState):
            messages = state["messages"]
            response = model_with_tools.invoke(messages) 
            return {"messages": [response]}

        def decide_begin(state: AgentState):
            return "call_model"

        def should_continue(state: AgentState):
            last_message = state["messages"][-1]
            if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
                return END
            else:
                return "tool_node"

        jarvis = StateGraph(AgentState)

        jarvis.add_node("call_model", call_model)
        jarvis.add_node("tool_node", tool_node)

        jarvis.set_conditional_entry_point(
            decide_begin,
            {"call_model": "call_model"}
        )

        jarvis.add_conditional_edges(
            "call_model",
            should_continue,
            {"tool_node": "tool_node", END: END}
        )
        jarvis.add_edge("tool_node", "call_model")

        jarvisGraph = jarvis.compile()

        yield jarvisGraph