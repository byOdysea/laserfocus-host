from typing import Dict, Any, List, Sequence, Annotated, TypedDict
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage

class Widget(TypedDict):
    """A widget to be displayed on the canvas."""
    id: str
    # Description of widget's current purpose
    description: str
    # Data that the widget is currently displaying - values of widget's properties
    data: Dict[str, Any]
    # Position of the widget
    position: int

class EngineState(TypedDict):
    """The state of the interface agent."""
    
    messages: Annotated[Sequence[BaseMessage], add_messages]
    widgets: List[Widget]