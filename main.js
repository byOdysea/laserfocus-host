require('dotenv').config(); // Ensure this is at the very top
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const logger = require('./logger');
const { StateGraph, END, START } = require('@langchain/langgraph');
const { HumanMessage, AIMessage, ToolMessage } = require('@langchain/core/messages');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { tool } = require('@langchain/core/tools');
const { z } = require('zod'); // For tool schema definition
const path = require('path');

// Enable electron-reload for HMR if in development mode
if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
  });
}

class AthenaWidgetWindow {
    constructor(primaryDisplay) {
        this.window = new BrowserWindow({
            width: 400,
            height: 500,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            frame: false, // Restore original setting
            transparent: true, // Restore original setting
            vibrancy: 'sidebar', // Restore original setting
            x: Math.round(primaryDisplay.workAreaSize.width / 2 - 200), // Centered horizontally
            y: primaryDisplay.workArea.y + Math.round(primaryDisplay.workAreaSize.height * 0.1) + 80, // Positioned below InputPill (70px height + 10px gap)
            alwaysOnTop: false, // Set to true if you want it to always float above other windows
            // x: 100, // Optional: set initial position
            // y: 100,
        });
    }

    init() {
        this.window.loadFile(path.join(__dirname, 'AthenaWidget/index.html'));
        logger.info('[AthenaWidgetWindow] Attempting to open ATTACHED DevTools for AthenaWidget...');
        this.window.webContents.openDevTools({ mode: 'detach' }); // Try attached mode
        logger.info('[AthenaWidgetWindow] Called openDevTools (attached) for AthenaWidget.');
    }

    sendConversationUpdate(type, content) {
        if (this.window && this.window.webContents) {
            this.window.webContents.send('conversation-update', { type, content });
        }
    }
}

class InputPill {
    constructor(primaryDisplay) {
        this.window = new BrowserWindow({
            width: 500,
            height: 70,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
            frame: false,
            transparent: true,
            vibrancy: 'under-window',
            x: Math.round(primaryDisplay.workAreaSize.width / 2 - 250), // Center 500px width
            y: primaryDisplay.workArea.y + Math.round(primaryDisplay.workAreaSize.height * 0.1), // 10% from top of work area
            alwaysOnTop: true,
        })
    }
    init() {
        this.window.loadFile('InputPill/index.html');
        logger.info('[InputPill] Attempting to open DETACHED DevTools for InputPill...');
        this.window.webContents.openDevTools({ mode: 'detach' }); // Ensure this is active
        logger.info('[InputPill] Called openDevTools (detached) for InputPill.');
    }
}

// --- LangGraph ReAct Agent Class Definition ---

// Define a simple mock tool (can be moved or managed elsewhere in a larger app)
const simpleSearchTool = tool(
  async ({ query }) => {
    console.log(`Tool called with query: ${query}`);
    if (query.toLowerCase().includes('electron')) {
      return "Electron is a framework for creating native applications with web technologies like JavaScript, HTML, and CSS.";
    }
    return "Sorry, I couldn't find information on that.";
  },
  {
    name: "simpleSearch",
    description: "A simple search tool. Use it to find information about a topic.",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
);

const initialTools = [simpleSearchTool];

class ReActAgent {
  constructor(apiKey, modelName, tools) {
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is missing. Please ensure it's set in your .env file and loaded correctly.");
    }
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.tools = tools;
    logger.info('[ReActAgent Constructor] Attempting to instantiate ChatGoogleGenerativeAI with apiKey:', process.env.GOOGLE_API_KEY ? 'Exists' : 'MISSING or undefined');
    this.llm = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: modelName, // Changed from modelName to model
    }).bindTools(this.tools);
    this.graph = this._buildGraph();
  }

  _defineAgentState() {
    return {
      messages: {
        value: (x, y) => x.concat(y),
        default: () => [],
      },
    };
  }

  async _callAgentNode(state) {
    const { messages } = state;
    logger.debug("Calling Agent with messages:", messages);
    const response = await this.llm.invoke(messages);
    logger.debug("Agent raw response:", response);
    return { messages: [response] };
  }

  async _callToolNode(state) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      logger.info("No tool calls in last message.");
      return { messages: [] };
    }

    logger.info("Tool node processing tool calls:", lastMessage.tool_calls);
    const toolMessages = [];
    for (const toolCall of lastMessage.tool_calls) {
      const toolInstance = this.tools.find(t => t.name === toolCall.name);
      if (toolInstance) {
        try {
          const toolOutput = await toolInstance.invoke(toolCall.args);
          toolMessages.push(new ToolMessage({ content: JSON.stringify(toolOutput), tool_call_id: toolCall.id }));
        } catch (e) {
          logger.error(`Error executing tool ${toolCall.name}:`, e);
          toolMessages.push(new ToolMessage({ content: `Error: ${e.message}`, tool_call_id: toolCall.id }));
        }
      } else {
        logger.warn(`Tool ${toolCall.name} not found.`);
        toolMessages.push(new ToolMessage({ content: `Tool ${toolCall.name} not found.`, tool_call_id: toolCall.id }));
      }
    }
    logger.debug("Tool node produced messages:", toolMessages);
    return { messages: toolMessages };
  }

  _shouldContinueNode(state) {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      logger.debug('Condition: routing to tools');
      return "continue";
    }
    logger.info("Condition: routing to end");
    return "end"; // Return string "end"
  }

  _buildGraph() {
    const workflow = new StateGraph({
      channels: this._defineAgentState(),
    });

    workflow.addNode("agent", this._callAgentNode.bind(this));
    workflow.addNode("tools", this._callToolNode.bind(this));
    workflow.addEdge(START, "agent"); // Use addEdge with START instead of setEntryPoint
    workflow.addConditionalEdges(
      "agent",
      this._shouldContinueNode.bind(this),
      {
        continue: "tools",
        end: END, // Key is string "end", value is END symbol
      }
    );
    workflow.addEdge("tools", "agent");
    return workflow.compile();
  }

  async invoke(userInput, config = { recursionLimit: 15 }) {
    const inputs = { messages: [new HumanMessage(userInput)] };
    return await this.graph.invoke(inputs, config);
  }
}

// --- End of LangGraph ReAct Agent Class Definition ---

let athenaWidget; // To hold the instance of AthenaWidgetWindow

const initializeApp = async () => {
    logger.info(`[initializeApp] Current NODE_ENV: ${process.env.NODE_ENV}`);
    const primaryDisplay = screen.getPrimaryDisplay();
    const inputPill = new InputPill(primaryDisplay);
    inputPill.init();

    athenaWidget = new AthenaWidgetWindow(primaryDisplay);
    athenaWidget.init();

    // Instantiate the ReActAgent
    const agent = new ReActAgent(
        process.env.GOOGLE_API_KEY,
        "gemini-2.0-flash",
        initialTools
    );

    // Example IPC to trigger agent from renderer (InputPill)
    ipcMain.on('run-agent', async (event, query) => {
      logger.info(`[IPC Main] Received query from InputPill: "${query}"`);
      try {
        const finalState = await agent.invoke(query);
        let agentResponse = "Agent finished without a direct answer."; // Default

        if (finalState && finalState.messages && finalState.messages.length > 0) {
          const lastMessage = finalState.messages[finalState.messages.length - 1];
          if (lastMessage &&
             (lastMessage.constructor?.name === 'AIMessage' || lastMessage.type === 'ai') &&
              lastMessage.content &&
              typeof lastMessage.content === 'string'
            ) {
            agentResponse = lastMessage.content;
          } else if (lastMessage && lastMessage.content && Array.isArray(lastMessage.content) && lastMessage.content.length > 0 && typeof lastMessage.content[0] === 'string') {
            agentResponse = lastMessage.content.join(' ');
          } else if (lastMessage && lastMessage.content && typeof lastMessage.content === 'object' && lastMessage.content.text) {
            agentResponse = lastMessage.content.text;
          }
        }

        logger.info(`[IPC Main] Sending agent response: "${agentResponse.trim()}"`);
        inputPill.window.webContents.send('agent-response', agentResponse);
        athenaWidget.sendConversationUpdate('user', query);
        athenaWidget.sendConversationUpdate('agent', agentResponse);

      } catch (e) {
        logger.error('[IPC Main] Error running agent from IPC:', e);
        const errorMessage = `Error: ${e.message}`;
        inputPill.window.webContents.send('agent-response', errorMessage);
        athenaWidget.sendConversationUpdate('user', query);
        athenaWidget.sendConversationUpdate('agent', errorMessage);
      }
    });
}

app.whenReady().then(() => {
    initializeApp();
})