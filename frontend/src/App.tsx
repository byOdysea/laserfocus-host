import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import Canvas from './components/Canvas'; 
import ChatInterface from './components/ChatInterface';

interface AppState {
  messages: Message[];
  canvas_width: number;
  canvas_height: number;
  canvas_widgets: any[];
  [key: string]: any;
}

interface AppUpdate {
  messages: { type: 'human'; content: string }[];
}

function App() {
  const apiUrl = "http://127.0.0.1:2024";
  const assistantId = "jarvis";

  const thread = useStream<AppState, { UpdateType: AppUpdate }>({ 
    apiUrl: apiUrl,
    assistantId: assistantId,
  });

  const handleSendMessage = (messageContent: string) => {
    const messageForBackend = { type: 'human' as const, content: messageContent };
    thread.submit({ messages: [messageForBackend] });
  };

  return (
    <div className="app-container">
      <div className="canvas-area">
         {/* Provide default empty array for canvasWidgets */}
         <Canvas canvasWidgets={thread.values?.canvas_widgets ?? []}/> 
      </div>
      <div className="chat-area">
        <ChatInterface
          // Provide default empty array for messages
          messages={thread.values?.messages ?? []} 
          isLoading={thread.isLoading}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}

export default App;
