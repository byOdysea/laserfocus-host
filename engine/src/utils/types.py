from typing import Dict, Any, List, Sequence, Annotated, TypedDict
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage

class Component(TypedDict):
    """A component to be displayed on the canvas."""
    id: str
    # Type of component (weather, email, calendar, todo, notes, reminders)
    type: str
    # Slot where component should be rendered ('primary' or 'sidebar')
    slot: str
    # Component-specific properties including data and configuration
    props: Dict[str, Any]

class Canvas(TypedDict):
    """Canvas containing components to be displayed."""
    components: List[Component]

class EngineState(TypedDict):
    """The state of the interface agent."""
    
    messages: Annotated[Sequence[BaseMessage], add_messages]
    canvas: Canvas