from typing import (
    Annotated,
    Sequence,
    TypedDict,
    List,
    Optional,
    Dict,
    Any
)
from langchain_core.messages import BaseMessage
from langchain_core.tools import tool
from langgraph.graph.message import add_messages
from langchain_google_genai import ChatGoogleGenerativeAI
import json
from langchain_core.messages import ToolMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END, START
import uuid
from pydantic.v1 import BaseModel, Field
from operator import add

# Define the structure for a widget on the canvas
class CanvasWidget(TypedDict):
    id: str                     # Unique identifier for the widget instance
    widget_name: str            # Name of the React widget to render (e.g., 'WeatherDisplay')
    x: int                      # Top-left x coordinate
    y: int                      # Top-left y coordinate
    width: int                  # Widget width
    height: int                 # Widget height
    props: Dict[str, Any]       # Dictionary of props to pass to the React widget

# Define the structured output for the Canvas LLM
class CanvasUpdateDecision(BaseModel):
    """Decision on whether and how to update the canvas with a React widget."""
    should_add_element: bool = Field(description="Set to true if a new React widget instance should be added to the canvas based on the context.")
    widget_name: Optional[str] = Field(None, description="Name of the React widget to add (e.g., 'WeatherDisplay'). Required if should_add_element is true.")
    x: Optional[int] = Field(None, description="Top-left x coordinate. Required if should_add_element is true.")
    y: Optional[int] = Field(None, description="Top-left y coordinate. Required if should_add_element is true.")
    width: Optional[int] = Field(None, description="Element width. Required if should_add_element is true.")
    height: Optional[int] = Field(None, description="Element height. Required if should_add_element is true.")
    props: Optional[Dict[str, Any]] = Field(None, description="Dictionary of props and their values to pass to the React widget (e.g., {'temperature': 75, 'unit': 'F'}). Required if should_add_element is true.")

class AgentState(TypedDict):
    """The state of the agent."""
    
    messages: Annotated[Sequence[BaseMessage], add_messages]
    # Add canvas state
    canvas_width: int
    canvas_height: int
    canvas_widgets: Annotated[List[CanvasWidget], add]

model = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    temperature=0
)

@tool
def get_weather(location: str):
    """Gets the current weather for a specified location using Open-Meteo API."""
    import requests

    # 1. Geocode location name to latitude/longitude
    geocode_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
    try:
        geo_response = requests.get(geocode_url)
        geo_response.raise_for_status()  # Raise an exception for bad status codes
        geo_data = geo_response.json()

        if not geo_data.get('results'):
            return f"Could not find coordinates for location: {location}"

        result = geo_data['results'][0]
        latitude = result['latitude']
        longitude = result['longitude']
        timezone = result.get('timezone', 'GMT') # Use GMT as fallback

    except requests.exceptions.RequestException as e:
        return f"Error during geocoding request: {e}"
    except (KeyError, IndexError):
        return f"Error parsing geocoding response for location: {location}"

    # 2. Get current weather using coordinates
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
        f"&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph"
        f"&precipitation_unit=inch&timezone={timezone}"
    )
    try:
        weather_response = requests.get(weather_url)
        weather_response.raise_for_status()
        weather_data = weather_response.json()

        # Return the current weather part of the response
        return weather_data.get('current_weather', {})

    except requests.exceptions.RequestException as e:
        return f"Error during weather request: {e}"
    except KeyError:
        return "Error parsing weather response."

tools = [get_weather]

model = model.bind_tools(tools)
tools_by_name = {tool.name: tool for tool in tools}

# --- Tool Node ---
def tool_node(state: AgentState):
    outputs = []
    # Check if the last message has tool calls
    if state["messages"][-1].tool_calls:
        for tool_call in state["messages"][-1].tool_calls:
            tool_result = tools_by_name[tool_call["name"]].invoke(tool_call["args"])
            outputs.append(
                ToolMessage(
                    content=json.dumps(tool_result),
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"],
                )
            )
        return {"messages": outputs}
    else:
        # If no tool call in the last message, pass through without adding messages
        # This might happen if should_continue routes here incorrectly, but safer to handle
        return {}

# --- Main Model Call Node ---
def call_model(
    state: AgentState,
    config: RunnableConfig,
):
    system_prompt = SystemMessage(
        "You are a helpful AI assistant, please respond to the users query to the best of your ability!"
    )
    response = model.invoke([system_prompt] + state["messages"], config)
    return {"messages": [response]}

def update_canvas_node(state: AgentState) -> dict:
    last_message = state["messages"][-1]

    # Check if the last message is a ToolMessage
    if not isinstance(last_message, ToolMessage):
        return {}

    # Construct prompt for Canvas LLM
    canvas_prompt = f"""
        You are a UI layout assistant for a React application. Your goal is to decide if information from a tool call should be displayed on a canvas by adding a **new instance** of a predefined React widget.

        Canvas Dimensions: {state['canvas_width']}x{state['canvas_height']}
        Current Canvas Widgets (for layout reference): {json.dumps(state['canvas_widgets'])}
        Result from the last tool call: {last_message.content}
        Last few messages in the conversation: {state['messages'][-5:]} 

        Available React Widgets:
        1.  **WeatherDisplay**: Shows weather information.
            - Props:
                - `location` (string): The city name.
                - `temperature` (integer): The temperature value.
                - `unit` (string): Temperature unit ('C' or 'F').
                - `description` (string): Brief weather description based on the temperature and weather code. 

        Task:
        Based ONLY on the tool result context and the current canvas state, decide if a new visual element (a React widget instance) should be added.
        - If yes, determine the 'widget_name' (must be one of the Available React Widgets), its 'x', 'y', 'width', 'height'.
        - Extract the relevant data from the tool result and construct the 'props' dictionary. The props MUST match the definition for the chosen widget.
        - **VERY IMPORTANT**: The 'props' field in your final output MUST be a valid JSON dictionary object, not a string. For example, if the tool result is `{{"location": "London", "temperature": 12, "unit": "C", "description": "Cloudy"}}`, the correct value for the 'props' field is `{{"location": "London", "temperature": 12, "unit": "C", "description": "Cloudy"}}`. Do NOT output it like this: `"props": "{{\\"location\\": \\"London\\", ...}}"`
        - Choose coordinates and dimensions carefully to fit within the canvas ({state['canvas_width']}x{state['canvas_height']}) and avoid overlapping existing widgets if possible. Find an empty spot. Estimate reasonable width/height if not obvious.
        - If no update is needed (e.g., tool data doesn't match any widget, or no space), indicate that by setting 'should_add_element' to false.

        Respond using the 'CanvasUpdateDecision' structure.
    """

    # Invoke the Canvas LLM (using the base model)
    try:
        # Get raw response (AIMessage containing the text)
        raw_response = model.invoke(canvas_prompt)
        response_text = raw_response.content

        # Attempt to parse the text as JSON
        try:
            # Strip potential markdown code fences if present
            if response_text.strip().startswith("```json"): 
                response_text = response_text.strip()[7:-3].strip()
            elif response_text.strip().startswith("```"): 
                response_text = response_text.strip()[3:-3].strip()
                
            parsed_data = json.loads(response_text)
        except json.JSONDecodeError as json_err:
            return {} # Cannot proceed

        # Attempt to validate the parsed JSON against the Pydantic model
        try:
            # Use parse_obj for pydantic v1 compatibility
            canvas_decision = CanvasUpdateDecision.parse_obj(parsed_data)
        except Exception as validation_err: # Catch pydantic validation errors specifically if desired
            return {} # Cannot proceed

        # --- Original logic using the validated canvas_decision ---
        if canvas_decision.should_add_element:
            # Ensure required fields are present if should_add_element is True
            if not all([canvas_decision.widget_name, canvas_decision.x is not None, canvas_decision.y is not None, canvas_decision.width is not None, canvas_decision.height is not None, canvas_decision.props is not None]):
                return {}

            new_widget = CanvasWidget(
                id=str(uuid.uuid4()),
                widget_name=canvas_decision.widget_name,
                x=canvas_decision.x,
                y=canvas_decision.y,
                width=canvas_decision.width,
                height=canvas_decision.height,
                props=canvas_decision.props or {}, # Default to empty dict if None, though validation should catch this
            )
            return {"canvas_widgets": [new_widget]}
        else:
            return {}
        # --- End of original logic ---

    except Exception as e:
        # Catch any other unexpected errors during the process
        return {}

# --- Initialization Node ---
def initialize_node(state: AgentState):
    """Sets initial canvas dimensions and clears widgets."""
    width = state.get("canvas_width", 1024)
    height = state.get("canvas_height", 768)
    return {
        "canvas_width": width,
        "canvas_height": height,
        "canvas_widgets": [] # Start with an empty list of widgets
    }

# --- Conditional Edges ---

# Condition: Decide whether to call a tool or end
def should_continue(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    # If there is no function call, then we finish
    if not last_message.tool_calls:
        return "end"
    # Otherwise if there is, we continue
    else:
        return "tool_node"

# --- Graph Definition ---
jarvis = StateGraph(AgentState)

# Add nodes
jarvis.add_node(initialize_node)
jarvis.add_node(call_model)
jarvis.add_node(tool_node)
jarvis.add_node(update_canvas_node)

# Define edges
jarvis.add_edge(START, "initialize_node") # Start with initialization
jarvis.add_edge("initialize_node", "call_model") # After init, call the main model

# Conditional edge from call_model to tool_node or END
jarvis.add_conditional_edges(
    "call_model",
    should_continue,
    {
        "tool_node": "tool_node",
        "end": END
    }
)

jarvis.add_edge("tool_node", "update_canvas_node")
jarvis.add_edge("update_canvas_node", "call_model")

# Compile
jarvisGraph = jarvis.compile()