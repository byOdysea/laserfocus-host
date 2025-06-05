import uuid
import json
import logging
from typing import Dict, Any, List

from src.utils.types import EngineState

# Set up logging
logger = logging.getLogger(__name__)

# Available component types
COMPONENT_TYPES = [
    "weather", "email", "calendar", "todo", "notes", "reminders"
]

# Available slots
SLOT_TYPES = ["primary", "sidebar"]

def process_canvas_logic(state: EngineState) -> Dict[str, Any]:
    """
    Deterministically updates the canvas state based on the agent's last tool call.
    This function does NOT make an LLM call.
    """
    current_canvas_state = state.get("canvas", {"components": []})
    current_components = list(current_canvas_state.get("components", [])) # Ensure it's a mutable list

    last_agent_message_with_tool_calls = None
    for msg in reversed(state.get("messages", [])):
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            last_agent_message_with_tool_calls = msg
            break
    
    if not last_agent_message_with_tool_calls:
        logger.warning("No agent message with tool calls found to process canvas logic.")
        return {"canvas": current_canvas_state}

    relevant_tool_call = None
    for tc in last_agent_message_with_tool_calls.tool_calls:
        if tc.get('name') in ['add_component_to_canvas', 'update_canvas', 'clear_canvas']:
            relevant_tool_call = tc
            break
            
    if not relevant_tool_call:
        logger.info("No relevant canvas tool call found in the last agent message.")
        return {"canvas": current_canvas_state}

    tool_name = relevant_tool_call.get('name')
    tool_args = relevant_tool_call.get('args', {})
    
    new_components = []

    try:
        if tool_name == 'add_component_to_canvas':
            logger.info(f"Processing 'add_component_to_canvas': {tool_args}")
            new_component_type = tool_args.get('component_type')
            new_component_slot = tool_args.get('slot', 'primary')
            props_input = tool_args.get('props', '{}')

            if not new_component_type or new_component_type not in COMPONENT_TYPES:
                logger.error(f"Invalid or missing component_type for add_component_to_canvas: {new_component_type}")
                return {"canvas": current_canvas_state}
            if new_component_slot not in SLOT_TYPES:
                logger.error(f"Invalid slot for add_component_to_canvas: {new_component_slot}")
                return {"canvas": current_canvas_state}

            parsed_props = {}
            if isinstance(props_input, str):
                try:
                    parsed_props = json.loads(props_input)
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse props JSON string for add_component_to_canvas: {props_input}")
            elif isinstance(props_input, dict):
                parsed_props = props_input
            else:
                logger.warning(f"Props for add_component_to_canvas is neither string nor dict: {props_input}")

            new_component = {
                "id": uuid.uuid4().hex[:8],
                "type": new_component_type,
                "slot": new_component_slot,
                "props": parsed_props
            }
            new_components = current_components + [new_component]
            logger.info(f"Added component. New canvas: {new_components}")

        elif tool_name == 'update_canvas':
            logger.info(f"Processing 'update_canvas': {tool_args}")
            components_from_tool = tool_args.get('components', [])
            
            validated_components = []
            if isinstance(components_from_tool, list):
                for comp_data in components_from_tool:
                    if not isinstance(comp_data, dict):
                        logger.warning(f"Skipping invalid component data (not a dict) in update_canvas: {comp_data}")
                        continue
                    
                    comp_id = comp_data.get('id')
                    if not comp_id and comp_data.get('type') in COMPONENT_TYPES:
                        comp_id = uuid.uuid4().hex[:8]
                        logger.info(f"Generated new ID {comp_id} for component type {comp_data.get('type')}")
                    
                    if not comp_id:
                        logger.warning(f"Skipping component with missing ID in update_canvas: {comp_data}")
                        continue
                    if comp_data.get('type') not in COMPONENT_TYPES:
                        logger.warning(f"Skipping component with invalid type '{comp_data.get('type')}' in update_canvas: {comp_data}")
                        continue
                    if comp_data.get('slot') not in SLOT_TYPES:
                        logger.warning(f"Skipping component with invalid slot '{comp_data.get('slot')}' in update_canvas: {comp_data}")
                        continue
                        
                    validated_components.append({
                        "id": comp_id,
                        "type": comp_data.get('type'),
                        "slot": comp_data.get('slot'),
                        "props": comp_data.get('props', {})
                    })
                new_components = validated_components
            else:
                logger.error(f"Components argument for update_canvas was not a list: {components_from_tool}")
                new_components = current_components
            logger.info(f"Updated canvas. New state: {new_components}")

        elif tool_name == 'clear_canvas':
            logger.info("Processing 'clear_canvas'")
            new_components = []
            logger.info("Cleared canvas.")
        
        else:
            logger.warning(f"Unknown tool_name encountered in process_canvas_logic: {tool_name}")
            return {"canvas": current_canvas_state}

        return {"canvas": {"components": new_components}}

    except Exception as e:
        logger.error(f"Error in process_canvas_logic: {str(e)}", exc_info=True)
        return {"canvas": current_canvas_state}
