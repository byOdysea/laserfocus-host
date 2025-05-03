import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { useRef, useEffect, useState } from 'react';
import Canvas from './components/Canvas'; 
import ChatInterface from './components/ChatInterface';

interface AppState {
  messages: Message[];
  canvas_width: number;
  canvas_height: number;
  canvas_widgets: any[];
  [key: string]: any;
}

function App() {
  const apiUrl = "http://127.0.0.1:2024";
  const assistantId = "jarvis";
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Function to update dimensions
    const updateDimensions = () => {
      if (canvasAreaRef.current) {
        setCanvasDimensions({
          width: canvasAreaRef.current.offsetWidth,
          height: canvasAreaRef.current.offsetHeight,
        });
      }
    };

    // Initial measurement
    updateDimensions();

    // Add event listener for window resize
    window.addEventListener('resize', updateDimensions);

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

  const thread = useStream<AppState, { UpdateType: { messages: Message[]; canvas_width: number; canvas_height: number } }>({ 
    apiUrl: apiUrl,
    assistantId: assistantId,
  });

  const handleSendMessage = (messageContent: string) => {
    const messageForBackend = { type: 'human' as const, content: messageContent };
    thread.submit({ messages: [messageForBackend], canvas_width: canvasDimensions.width, canvas_height: canvasDimensions.height });
  };

  return (
    <div className="app-container">
      <div className="canvas-area" ref={canvasAreaRef}>
         <Canvas canvasWidgets={thread.values?.canvas_widgets ?? []}/> 
      </div>
      <div className="chat-area">
        <ChatInterface
          messages={thread.values?.messages ?? []} 
          isLoading={thread.isLoading}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}

export default App;
