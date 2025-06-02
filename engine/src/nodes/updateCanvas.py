from typing import Dict, Any, List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage
from pydantic import BaseModel, Field
import logging
import json
from src.utils.types import EngineState

# Set up logging
logger = logging.getLogger(__name__)

# Available component types
COMPONENT_TYPES = [
    "weather",
    "email",
    "calendar", 
    "todo",
    "notes",
    "reminders"
]

# Available slots
SLOT_TYPES = ["primary", "sidebar"]

# Pydantic model for component structure
class PydanticComponent(BaseModel):
    id: str = Field(..., description="Unique id for the component")
    type: str = Field(..., description=f"Type of component. Must be one of: {', '.join(COMPONENT_TYPES)}", 
                     pattern=f"^({'|'.join(COMPONENT_TYPES)})$")
    slot: str = Field(..., description=f"Slot where component should be rendered. Must be one of: {', '.join(SLOT_TYPES)}",
                     pattern=f"^({'|'.join(SLOT_TYPES)})$")
    props: Dict[str, Any] = Field(default_factory=dict, 
                                description="Component-specific properties including data, configuration, and state")

def update_canvas(state: EngineState) -> Dict[str, Dict[str, List[Dict]]]:
    """
    Updates the canvas based on the last action using structured output from the LLM.
    """
    try:
        # Initialize the model
        model = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0
        )
        
        # Ensure canvas exists in state
        current_canvas = state.get("canvas", {"components": []})
        current_components = current_canvas.get("components", [])
        
        # Prepare system prompt
        system_prompt = SystemMessage(
            content=f"""
            You are a UI layout manager for a desktop productivity application. Your task is to update the canvas components based on the conversation history.
            
            Current components: {current_components}
            
            LAYOUT SYSTEM:
            - Slot "primary": Main content area (center stage) - use for the main focused component
            - Slot "sidebar": Side panels - use for supporting widgets and quick-access tools
            
            AVAILABLE COMPONENT TYPES:
            - "weather": Displays weather information with location, temperature, conditions, and forecast
            - "email": Email client with inbox, compose, and reading capabilities  
            - "calendar": Calendar with events, scheduling, and date management
            - "todo": Task management with lists, completion tracking, and priorities
            - "notes": Note-taking app supporting markdown and rich text
            - "reminders": Reminder and notification management
            
            COMPONENT PROPS GUIDELINES:
            Each component type accepts specific props in the "props" field:
            
            Weather props:
            - data: {{location, temperature, condition, humidity, windSpeed, forecast}}
            - unit: "celsius" or "fahrenheit"
            - showDetails: boolean for extended info

            Email props:
            - viewMode: "list" or "single" 
            - emails: array of email objects
            - selectedEmail: email ID for single view
            - filter: "all", "unread", "starred", "sent", "drafts", "trash"
            - isComposing: boolean for compose mode
            
            Calendar props:
            - viewMode: "month", "week", "day"
            - selectedDate: ISO date string
            - events: array of event objects
            - showWeekends: boolean
            
            Todo props:
            - lists: array of todo list objects with tasks
            - selectedList: list ID
            - showCompleted: boolean
            - sortBy: "priority", "date", "alphabetical"
            
            Notes props:
            - notes: array of note objects
            - selectedNote: note ID
            - viewMode: "list", "single", "edit"
            - searchQuery: string for filtering
            
            Reminders props:
            - reminders: array of reminder objects
            - filter: "all", "today", "upcoming", "overdue"
            - showCompleted: boolean

            RULES:
            1. Only create components that would be helpful for the current conversation context
            2. Use "primary" slot for the main focused component the user wants to interact with
            3. Use "sidebar" slot for supporting widgets and quick-reference information
            4. Each component must have a unique ID
            5. Keep data relevant and helpful - don't include placeholder data unless necessary
            6. For email component, use realistic email data when showing examples
            7. For calendar component, use current/relevant dates
            8. Maintain existing component data when possible, only update what's needed

            Respond with a JSON object containing a "components" array that matches this structure:
            {{
              "components": [
                {PydanticComponent.schema_json(indent=2)}
              ]
            }}

            Only include components that should be visible on the canvas right now.
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
            canvas_data = json.loads(content)
            
            # Ensure it has the right structure
            if isinstance(canvas_data, dict) and "components" in canvas_data:
                components = canvas_data["components"]
            elif isinstance(canvas_data, list):
                components = canvas_data
            else:
                components = []
                
            if not isinstance(components, list):
                components = []
                
            return {"canvas": {"components": components}}
            
        except (json.JSONDecodeError, AttributeError) as e:
            logger.error(f"Failed to parse LLM response: {e}\nContent: {response.content}")
            return {"canvas": current_canvas}
            
    except Exception as e:
        logger.error(f"Error in update_canvas: {str(e)}", exc_info=True)
        return {"canvas": state.get("canvas", {"components": []})}