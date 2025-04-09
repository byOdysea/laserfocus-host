# Laserfocus Host

This project implements the backend host server for the Laserfocus system. It provides a WebSocket interface for clients to interact with a Large Language Model (LLM - currently Google Gemini) that is augmented with external tools managed via the Model Context Protocol (MCP).

## Prerequisites

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (recommended for environment and package management)
- An environment variable `GEMINI_API_KEY` set with a valid Google Gemini API key (see Setup).

## Setup

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd laserfocus-host
    ```

2.  **Create a virtual environment and install dependencies:**

    ```bash
    # Create the environment
    uv venv

    # Activate the environment (example for bash/zsh)
    source .venv/bin/activate

    # Install dependencies from uv.lock
    uv sync
    ```

3.  **Configure environment variables:**

    - Copy the example environment file:
      ```bash
      cp .env.example .env
      ```
    - Edit the `.env` file and add your `GEMINI_API_KEY`.

4.  **Configure MCP Servers:**
    - The `mcp.json` file defines the external tool servers. Review this file and ensure the paths and commands are correct for your environment (especially for `filesystem` and `git` servers).

## Running the Application

1.  **Start the Host Server:**

    - Ensure your virtual environment is activated (`source .venv/bin/activate`).
    - Run the main application:
      ```bash
      python src/main.py
      ```
    - The server will start and log initialization steps, including connecting to MCP servers.

2.  **Run the CLI Client:**
    - Open a **new terminal window**.
    - Activate the virtual environment: `source .venv/bin/activate`.
    - Run the command-line client:
      ```bash
      python src/cli_client.py
      ```
    - You should see a "Connected!" message and a `>>>` prompt. You can now interact with the LLM. Type `quit` to exit the client.

## Project Structure Overview

- **Application Setup (`src/main.py`)**: Main application entry point. Initializes components and starts the server.
- **CLI Client (`src/cli_client.py`)**: A simple command-line client for interacting with the server.
- **Core Logic (`src/core/`)**: Contains the main business logic modules:
  - **Conversation Orchestrator (`orchestrator.py`)**: Manages conversation flow, history, and coordinates LLM/tool interactions.
  - **LLM Service (`llm_service.py`)**: Handles LLM communication logic, including prompt formatting and response parsing.
  - **LLM Adapter (`gemini_adapter.py`)**: Specific implementation for interacting with the Google Gemini API.
  - **MCP Coordinator (`mcp_coordinator.py`)**: Manages connections to external tool servers defined in `mcp.json`.
- **Handlers (`src/handlers/`)**: Contains network handlers.
  - **WebSocket Handler (`websocket_handler.py`)**: Manages WebSocket connections and message routing.
- **MCP Configuration (`mcp.json`)**: Configuration file defining the MCP tool servers.
- **Environment Configuration (`.env` / `.env.example`)**: Environment variable configuration (API keys, etc.).
- **Architecture Overview (`ARCHITECTURE.md`)**: A high-level overview of the system architecture and data flow.
