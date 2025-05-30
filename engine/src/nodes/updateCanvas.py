from typing import Dict, Any, List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage
from pydantic import BaseModel, Field
import logging
import json
from src.utils.types import EngineState

# Set up logging
logger = logging.getLogger(__name__)

# Available widget types
WIDGET_TYPES = [
    "email_viewer",
    "email_composer",
    "calendar",
    "weather",
    "web_browser",
    "file_browser",
    "task_manager",
    "note_taker"
]

# Pydantic model for widget structure
class PydanticWidget(BaseModel):
    id: str = Field(..., description="Unique id for the widget")
    type: str = Field(..., description=f"Type of widget. Must be one of: {', '.join(WIDGET_TYPES)}", 
                     pattern=f"^({'|'.join(WIDGET_TYPES)})$")
    description: str = Field(..., description="Description of widget's current purpose")
    data: Dict[str, Any] = Field(default_factory=dict, 
                               description="Data that the widget is currently displaying")
    position: int = Field(..., 
                         description="Position on the canvas (0-6), where 0 is center, 1-3 are left sidebar, 4-6 are right sidebar")

def update_canvas(state: EngineState) -> Dict[str, List[Dict]]:
    """
    Updates the canvas based on the last action using structured output from the LLM.
    """
    try:
        # Initialize the model
        model = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0
        )
        
        # Ensure widgets exist in state
        current_widgets = state.get("widgets", [])
        
        # Prepare system prompt
        system_prompt = SystemMessage(
            content=f"""
            You are a UI layout manager. Your task is to update the canvas widgets based on the conversation history.
            
            Current widgets: {current_widgets}
            
            Layout rules:
            - Position #0: Main focused widget (center stage)
            - Positions #1-3: Left sidebar (vertical stack)
            - Positions #4-6: Right sidebar (vertical stack)
            
            Available widget types:
            - email_viewer: Displays a list of emails
            - email_composer: For composing new emails
            - calendar: Shows calendar events
            - weather: Displays weather information
            - web_browser: Embeds a web page
            - file_browser: For file system navigation
            - task_manager: Manages tasks
            - note_taker: For taking notes (Markdown/Obsidian)

            Respond with a JSON array of widgets that matches this structure:
            {PydanticWidget.schema_json(indent=2)}

            Important guidelines:
            1. Only include widgets that should be visible
            2. Ensure positions are unique (0-6)
            3. Keep important data when updating widgets
            """
        )
        
        # Get response from the LLM
        response = model.invoke([system_prompt] + list(state["messages"]))
        
        try:
            # Clean the response content (remove markdown code block markers)
            content = response.content.strip()
            if content.startswith('```json'):
                content = content[7:]  # Remove ```json
            if content.endswith('```'):
                content = content[:-3]  # Remove ```
            content = content.strip()
            
            # Try to parse the response as JSON
            widgets = json.loads(content)
            if not isinstance(widgets, list):
                widgets = [widgets]
            return {"widgets": widgets}
        except (json.JSONDecodeError, AttributeError) as e:
            logger.error(f"Failed to parse LLM response: {e}\nContent: {response.content}")
            return {"widgets": current_widgets}
            
    except Exception as e:
        logger.error(f"Error in update_canvas: {str(e)}", exc_info=True)
        return {"widgets": state.get("widgets", [])}