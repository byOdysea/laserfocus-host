from typing import Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, BaseMessage
from langchain_core.runnables.config import RunnableConfig
from langchain_mcp_adapters.client import MultiServerMCPClient

from src.utils.types import EngineState
from src.tools import (
    get_weather,
    generate_email_data,
    generate_calendar_data,
    generate_todo_data,
    generate_notes_data,
    generate_reminders_data
)

def generate_action(
    state: EngineState,
    config: RunnableConfig,
) -> Dict[str, list[BaseMessage]]:
    """Generates a single action to execute to fulfill the user's query."""
    model = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0
    )

    # Include all available tools
    tools = [
        get_weather,
        generate_email_data,
        generate_calendar_data,
        generate_todo_data,
        generate_notes_data,
        generate_reminders_data
    ]
    model = model.bind_tools(tools)

    system_prompt = SystemMessage(
        """You are the Action Generator for LaserFocus, an intelligent desktop interface system.

SYSTEM OVERVIEW:
LaserFocus uses a slot-based UI with components displayed across different areas:
- PRIMARY slot: Main content area for focused work
- SIDEBAR slot: Secondary widgets and quick info panels

AVAILABLE COMPONENT TYPES:
- weather: Real-time weather information with forecasts
- email: Email management and display
- calendar: Calendar events and scheduling
- todo: Task lists and productivity tracking
- notes: Note-taking and text editing
- reminders: Alerts and notifications

DECISION STRATEGY:
- For weather requests: Use real weather data when possible
- For productivity requests: Consider todo, calendar, notes, or reminders components
- For demonstrations: Create sample layouts or components
- Always prefer actionable responses that enhance the user's workflow

RESPONSE APPROACH:
1. Identify the user's primary intent
2. Choose the most relevant tool to address their request
3. Use real data sources when available
4. Consider both immediate needs and workflow enhancement

Respond with the most immediate, helpful action that addresses the user's request directly."""
    )
    
    response = model.invoke([system_prompt] + state["messages"], config)
    
    return {"messages": [response]}