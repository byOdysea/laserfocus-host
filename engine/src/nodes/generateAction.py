from typing import Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, BaseMessage
from langchain_core.runnables.config import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient

from src.utils.types import EngineState
from src.tools.index import get_weather

def generate_action(
    state: EngineState,
    config: RunnableConfig,
) -> Dict[str, list[BaseMessage]]:
    """Generates a single action to execute to fulfill the user's query."""
    model = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0
    )

    tools = [get_weather]
    model = model.bind_tools(tools)

    system_prompt = SystemMessage(
        """
        Respond with the most immediate next action to be taken.
        """
    )
    response = model.invoke([system_prompt] + state["messages"], config)
    
    return {"messages": [response]}