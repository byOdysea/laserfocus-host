from typing import Dict, Any, List, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field, field_validator
import json
import uuid
import logging

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


class BaseComponentProps(BaseModel):
    props: Optional[Dict[str, Any]] = Field(default_factory=dict) # Reverted to Any

    @field_validator('props', mode='before')
    @classmethod
    def parse_props_from_str(cls, value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse props string: {value}. Returning empty dict.")
                return {}
        if value is None:
            return {}
        return value

class ComponentInput(BaseComponentProps):
    """Input model for a single component in update_canvas."""
    type: str = Field(..., description=f"Type of component. Must be one of: {', '.join(COMPONENT_TYPES)}")
    slot: str = Field(..., description=f"Slot where component should be rendered. Must be one of: {', '.join(SLOT_TYPES)}")
    id: Optional[str] = None # ID can be optional, will be generated if not provided
    # props inherited from BaseComponentProps and validated there

@tool
def update_canvas(components: List[ComponentInput]) -> Dict[str, Any]:
    """
    Updates the canvas with the specified components.
    
    This tool manages the UI layout by placing components in designated slots.
    Use this to display information to the user through various UI components.
    
    LAYOUT SYSTEM:
    - Slot "primary": Main content area (center stage) - use for the main focused component
    - Slot "sidebar": Side panels - use for supporting widgets and quick-access tools
    
    AVAILABLE COMPONENT TYPES:
    - "weather": Displays weather information
    - "email": Email client interface
    - "calendar": Calendar with events
    - "todo": Task management
    - "notes": Note-taking app
    - "reminders": Reminder management
    
    Args:
        components: List of component configurations. Each component in the list MUST have:
            - id: The ID of the component to update. If moving an existing component, this MUST be its current ID.
            - type: Component type (e.g., weather, email, calendar). This MUST be the type of the component being updated/moved.
            - slot: The new slot where the component should be placed (e.g., primary or sidebar).
            - props: Component-specific configuration (as a Python dictionary). These are the props of the component being updated/moved.
    
    Returns:
        Canvas update with components
    """
    try:
        validated_components = []
        
        for comp in components:
            # Pydantic model ComponentInput now handles validation for type, slot, and props parsing.
            # ID generation if not provided:
            component_data = comp.model_dump() # Get data from Pydantic model
            if component_data.get('id') is None:
                component_data['id'] = str(uuid.uuid4())[:8]
            
            validated_components.append(component_data)
        
        # Return in a format that updates the state's canvas
        return {"canvas": {"components": validated_components}}
        
    except Exception as e:
        logger.error(f"Error updating canvas: {str(e)}")
        return {"canvas": {"components": []}}

@tool 
def clear_canvas() -> Dict[str, Any]:
    """
    Clears all components from the canvas.
    Use this when you want to start fresh or remove all displayed information.
    
    Returns:
        Empty canvas configuration
    """
    return {"canvas": {"components": []}}

@tool
def add_component_to_canvas(component_type: str, slot: str = "primary", props: Optional[str] = None) -> Dict[str, Any]:
    """
    Adds a single component to the canvas.
    
    Args:
        component_type (str): Type of component. Must be one of: {', '.join(COMPONENT_TYPES)}.
        slot (str, optional): Slot where component should be rendered. Must be one of: {', '.join(SLOT_TYPES)}. Defaults to "primary".
        props (Optional[str], optional): Component-specific configuration as a JSON string. E.g., '{{\"filter\": \"active\"}}'. Components will fetch their own data based on these props. Defaults to None.
        
    Returns:
        Dict[str, Any]: Component configuration that was added or an error dictionary.
    """
    if component_type not in COMPONENT_TYPES:
        error_msg = f"Invalid component_type '{component_type}'. Must be one of: {', '.join(COMPONENT_TYPES)}"
        logger.error(error_msg)
        return {"error": error_msg, "component_added": None}

    if slot not in SLOT_TYPES:
        error_msg = f"Invalid slot '{slot}'. Must be one of: {', '.join(SLOT_TYPES)}"
        logger.error(error_msg)
        return {"error": error_msg, "component_added": None}

    parsed_props = {}
    if props:
        try:
            parsed_props = json.loads(props)
            if not isinstance(parsed_props, dict):
                logger.error(f"Parsed props from string '{props}' is not a dict: {parsed_props}. Defaulting to empty dict.")
                parsed_props = {}
        except json.JSONDecodeError:
            logger.error(f"Failed to parse props string in add_component_to_canvas: '{props}'. Defaulting to empty dict.")
            parsed_props = {}
            
    component_data = {
        "id": str(uuid.uuid4())[:8],
        "type": component_type,
        "slot": slot,
        "props": parsed_props
    }
    
    return {"canvas": {"components": [component_data]}} 