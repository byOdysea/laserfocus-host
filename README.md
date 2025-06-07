# LaserFocus: AI-Powered Window Management

## Overview

LaserFocus is an Electron-based desktop application that leverages an AI agent to manage browser windows within the application. Users can interact with the agent using natural language to request actions like opening specific URLs in new windows or closing existing windows. The application is designed to maintain a persistent state of open windows and conversation history across agent invocations, ensuring a seamless user experience.

## Core Architecture

The application consists of several key components working together:

1.  **Electron Main Process (`src/main.ts`):**
    *   Initializes the application, UI components (from `src/apps/`), and core services (from `src/core/`).
    *   Serves as the main entry point and orchestrates application lifecycle.

2.  **`CanvasEngine` (`src/core/engine/canvas-engine.ts`):**
    *   The central orchestrator and "brain" of the application.
    *   Manages the lifecycle of browser windows (creating, tracking, closing).
    *   Persists the state of open windows (`_currentCanvasState`) and the conversation history (`_currentMessages`) across user interactions.
    *   Hosts and invokes the LangGraph-based AI agent.
    *   Provides tools (e.g., `open_browser_window`, `close_browser_window`) for the agent to interact with the application's windowing system.

3.  **LangGraph Agent (within `CanvasEngine`):**
    *   A stateful graph built using LangGraph that defines the agent's decision-making process.
    *   Utilizes a Large Language Model (LLM, e.g., Google's Gemini) to understand user requests and decide which tools to use.
    *   The graph manages the flow: receiving user input, calling the LLM, executing tools, updating canvas state, and returning a response.

4.  **User Interface Applications (`src/apps/`):**
    *   Each UI-facing component or 'app' (e.g., `InputPill`, `AthenaWidget`) is located in its own subdirectory within `src/apps/`.
    *   These directories co-locate their renderer assets (HTML, CSS, client-side JS/TS) and their main process controllers (e.g., `src/apps/InputPill/input-pill.main.ts`).
    *   **`InputPill`:** A UI element allowing the user to type their requests for the agent.
    *   **`AthenaWidget`:** A UI element that can display conversation history or agent responses.
    *   **Canvas Windows:** Electron `BrowserWindow` instances that are opened and managed by the `CanvasEngine` based on agent actions. These display web content.

5.  **Core Bridge (`src/core/bridge/`):**
    *   Manages Inter-Process Communication (IPC). This includes standard Electron IPC between renderer processes (`src/apps/`) and the main process, as well as an internal event bus pattern *within* the main process.
    *   **Main Process Internal Event Bus:** For communication between different main process modules (e.g., `main-handlers.ts` and app-specific IPC handlers like `athena-widget.ipc.ts`), the system uses `ipcMain.emit('event-name', payload)` and `ipcMain.on('event-name', listenerCallback)`.
        *   **Important Listener Pattern:** When using `ipcMain.on` for these internal events, the `listenerCallback`'s first argument (typically typed `event: IpcMainEvent` to satisfy TypeScript) will actually *be* the `payload` sent by `ipcMain.emit`. To correctly access the payload, a type assertion like `const actualPayload = event as any as YourPayloadType;` is used within the listener.
    *   **Modular IPC Handling:** Each application in `src/apps/` can define its own IPC handlers by implementing the `AppIpcModule` interface. These modules are registered by the `BridgeService` (`src/core/bridge/bridge.service.ts`) during application startup, promoting organized and decoupled communication logic.
    *   User input from `InputPill`, for instance, is relayed to `CanvasEngine` via the `'run-agent'` IPC event, handled in `src/core/bridge/main-handlers.ts`, which then uses the internal event bus to notify other relevant modules like `AthenaWidget`.

## Workflow Diagram

The following diagram illustrates the typical workflow when a user makes a request:

```mermaid
graph TD
    A[User Enters Query in InputPill] --> B{IPC: 'run-agent'};
    B --> C[CanvasEngine.invoke(query)];
    C --> D{Graph Execution};
    D -- 1. Prepare Initial State --> E[AgentState (current canvas, new input)];
    D -- 2. Call Agent Node --> F{_callAgentNode};
    F -- Uses persisted history & canvas --> G[LLM (e.g., Gemini)];
    G -- Decides tool use --> F;
    F -- Returns AIMessage w/ tool_calls --> D;
    D -- 3. Conditional Routing --> H{_shouldContinueNode};
    H -- If tool_calls exist --> I[ToolNode];
    I -- Executes open/close_browser_window --> J[coreOpenWindow / coreCloseWindow];
    J -- Modifies Electron BrowserWindow --> K[Actual Window Action (Open/Close)];
    J -- Updates persisted _currentCanvasState & _currentOpenWindows --> C;
    I -- Returns ToolMessage --> D;
    D -- 4. Update Graph Canvas State --> L{_updateCanvasStateFromToolsNode};
    L -- Updates graph's canvas.windows --> D;
    D -- 5. Loop back to Agent or End --> H;
    H -- If no tool_calls (or end) --> M[Final AgentState];
    M --> C;
    C -- Returns final state --> N[IPC: 'agent-response'];
    N --> O[UI Updates (e.g., AthenaWidget)];

    subgraph CanvasEngine Instance
        C
        J
        F
        L
    end

    subgraph LangGraph
        D
        E
        H
        I
        M
    end
```

## Key Components in Detail

### `CanvasEngine`

*   **Responsibilities:**
    *   Manages the lifecycle of `BrowserWindow` instances used as "canvases."
    *   Persists conversation history and the abstract state of all open windows (ID, URL, title, geometry). This state is crucial for the agent to have context.
    *   Initializes and runs a LangGraph agent, providing it with tools to interact with the application.
    *   Handles events like manual window closures to keep its persisted state synchronized.
*   **State Management:**
    *   `_currentMessages`: An array of `BaseMessage` objects, storing the entire conversation history.
    *   `_currentCanvasState`: An object containing `{ windows: OpenWindowInfo[] }`, representing all currently known open windows. This is the primary source of truth for the agent about window states.
    *   `currentOpenWindows`: A `Map<string, BrowserWindow>` for quick access to live `BrowserWindow` instances by their ID.
*   **Agent Interaction:**
    *   The `invoke` method is the main entry point. It takes user input, sets up the initial state for the LangGraph agent (using persisted canvas state and the new input), runs the graph, and then updates the persisted state from the graph's final output.
    *   `_callAgentNode`: Prepares the system prompt (including the list of current windows) and the full message history before calling the LLM.
    *   `_updateCanvasStateFromToolsNode`: This custom node runs after the `ToolNode`. It's necessary because the standard `ToolNode` (from `@langchain/langgraph/prebuilt`) executes tools but doesn't inherently know how to update our specific `canvas.windows` structure within the `AgentState`. This node inspects tool outputs (e.g., from `open_browser_window`) and correctly updates the graph's `canvas.windows` state, ensuring accurate state propagation within the graph and back to the `CanvasEngine`'s persisted state.

### LangGraph Agent

*   **Structure:** A `StateGraph<AgentState>` where `AgentState` includes `messages: BaseMessage[]` and `canvas: { windows: OpenWindowInfo[] }`.
*   **Nodes:**
    *   `agent` (`_callAgentNode`): Invokes the LLM.
    *   `tools` (`ToolNode`): Executes tools chosen by the LLM.
    *   `_update_canvas_state` (`_updateCanvasStateFromToolsNode`): Updates the graph's canvas state based on tool outputs.
*   **Flow:** The graph typically flows from `agent` -> `tools` -> `_update_canvas_state` -> `agent`, continuing until the agent decides no more tools are needed.

## Component-Led Data Fetching Strategy

A recent architectural shift moves towards a component-led data fetching model for UI elements displayed on the canvas (e.g., hypothetical ToDo, Calendar, or Email components). This strategy aims to make UI components more self-contained and reduce the agent's direct data-handling responsibilities.

*   **Agent's Role:** Instead of fetching data for components, the agent's primary role is to understand the user's intent and determine *what* components are needed and *what data requirements or configuration* those components have. It then uses canvas tools like `add_component_to_canvas` or `update_canvas`.
*   **`props` Argument:** The `props` argument of these canvas tools is crucial. The agent passes data-fetching parameters, configuration, or initial state requirements through `props`. For example, for a ToDo component, `props` might include `{ "filter": "today", "sortBy": "priority" }`.
*   **Component Responsibility:** The UI components themselves (e.g., React components) are responsible for receiving these `props`, making their own API calls (simulated or real) to fetch the actual data, and managing their internal state (e.g., using `useEffect` in React).
*   **Pydantic Validation:** The `props` argument in the Python tools (`engine/src/tools/canvas.py`) is validated using Pydantic models to ensure type safety and that `props` are correctly parsed (e.g., from a JSON string to a dictionary if necessary).
*   **Exception - `Weather` Component:** For some components like `Weather`, the agent may still directly fetch data using a specific tool (e.g., `get_weather`) and then pass the fetched data directly into the component's `props` (e.g., `props: { "weatherData": ... }`).

This approach promotes better separation of concerns, allowing UI components to be more autonomous and the agent to focus on orchestration and intent understanding.

## Known Issues

*   **Agent State Bug: Malformed/Crashed Windows Not Tracked for Closure**
    *   **Description:** The AI agent and potentially the `CanvasEngine`'s window state tracking do not correctly recognize Electron `BrowserWindow` instances that were created but failed to load their URL (e.g., due to `ERR_INVALID_URL`) as 'open' for the purpose of subsequent `close_browser_window` tool calls. 
    *   **Symptom:** If a window fails to load content (e.g., user provides "x.com" instead of "https://x.com"), the `open_browser_window` tool correctly reports the error. However, if the user then asks to close that window, the agent might incorrectly report that no windows are open, even if an empty or error-state `BrowserWindow` instance still exists on screen.
    *   **Impact:** Users might be unable to close these 'ghost' windows using agent commands and may need to manually close them if they are visible.
    *   **Status:** Identified. A potential fix would involve ensuring that `CanvasEngine` still tracks the `BrowserWindow` instance even if its content fails to load, and that the `close_browser_window` tool can target such windows.

## Future Architectural Considerations

As LaserFocus evolves, the following architectural patterns and preferences are noted for future development:

*   **App-Specific Data Persistence:** For features requiring local data storage (e.g., a Notes app using SQLite), the data management logic (database connection, CRUD operations, schemas) will be encapsulated within the respective app's directory, typically under `src/apps/AppName/data/`. The app's main process controller (`src/apps/AppName/appname.main.ts`) will manage this data logic and expose it to its renderer via IPC through the `src/core/bridge/`.

*   **Dedicated Backend Services:** If the application requires more complex backend processes that warrant a separate server (beyond what the Electron main process can suitably handle, or for services shared across many potential apps/clients), the preference is to use [Bun](https://bun.sh/) as the JavaScript runtime and framework for building these services.
*   **Refine Agent Tool Output:** Continuously refine prompt engineering to ensure that when the agent decides to use tools, its output consists *strictly* of the structured tool call JSON (e.g., `{"tool_calls": [...]}`), without any conversational prefixes or suffixes. This aims to maximize responsiveness and reduce processing overhead when parsing agent actions.

## Setup & Running

*   **Prerequisites:**
    *   Node.js (LTS version, e.g., 20.x.x or later recommended)
    *   Yarn (Classic or Berry)
*   **Installation:**
    1.  Clone the repository:
        ```bash
        git clone <repository-url> # Replace <repository-url> with the actual URL
        cd laserfocus
        ```
    2.  Install dependencies:
        ```bash
        yarn install
        ```
*   **Environment Setup:**
    1.  Create a `.env` file in the project root (copy from `.env.example` if it exists).
    2.  Add necessary environment variables, primarily:
        *   `GOOGLE_API_KEY`: Your API key for Google Generative AI services.
        *   `VITE_DEV_SERVER_URL=http://localhost:5173` (This is the default for Vite and usually doesn't need changing unless you've configured Vite differently).
*   **Running the App (Development Mode):**
    ```bash
    yarn dev
    ```
    This command typically runs Vite for the renderer HMR and Electron concurrently.
*   **Building for Production (Example):**
    (Add specific build commands here once defined, e.g., `yarn build` or `yarn package`)

## Environment Variables

The application may require the following environment variables (e.g., in a `.env` file at the project root):

*   `GOOGLE_API_KEY`: Your API key for Google Generative AI services (Gemini).
*   `VITE_DEV_SERVER_URL`: (If using Vite for the renderer) URL for the Vite development server, e.g., `http://localhost:5173`.

This README provides a foundational understanding of the LaserFocus project.
