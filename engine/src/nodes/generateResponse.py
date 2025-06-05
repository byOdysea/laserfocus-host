# --- Main Model Call Node ---
def generate_response(
    state: EngineState,
    config: RunnableConfig,
):
    """Generates a conversational response to the user's query."""
    system_prompt = SystemMessage(
        "You are a helpful AI assistant, please respond to the users query to the best of your ability!"
    )
    response = model.invoke([system_prompt] + state["messages"], config)
    return {"messages": [response]}