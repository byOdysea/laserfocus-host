import React, { useState, useRef, useEffect } from 'react';
// Import SDK Message type AND specific message types from the SDK itself
import type { Message, AIMessage, ToolMessage } from '@langchain/langgraph-sdk';

interface ChatInterfaceProps {
  messages: Message[]; // Expect SDK Message type (which is likely a union)
  isLoading: boolean;
  onSendMessage: (message: string) => void;
}

function ChatInterface({ messages, isLoading, onSendMessage }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  // Helper to get CSS class based on message type
  const getMessageClass = (messageType: string) => { // Use type property
    switch (messageType) {
      case 'human':
        return 'message message-user';
      case 'ai':
        return 'message message-assistant';
      case 'tool':
        return 'message message-tool';
      default:
        return 'message'; // For system, etc.
    }
  };

  return (
    <div className="chat-interface-container">
      <div className="messages-display-area">
        {messages.map((msg, index) => {
          // Determine class based on type
          const messageClass = getMessageClass(msg.type);

          // Prepare content and potential tool info
          let displayContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          let toolInfo = null;

          // Use type guards with casting to the SDK's message types
          if (msg.type === 'ai') {
            const aiMsg = msg as AIMessage; // Cast to SDK's AIMessage
            if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
              toolInfo = (
                <div className="tool-calls">
                  Tool Calls: {JSON.stringify(aiMsg.tool_calls)}
                </div>
              );
            }
          } else if (msg.type === 'tool') {
            const toolMsg = msg as ToolMessage; // Cast to SDK's ToolMessage
             toolInfo = (
               <div className="tool-result">
                 Tool Result (ID: {toolMsg.tool_call_id}): {displayContent}
               </div>
             );
             // Optionally hide the raw tool content if displayed in toolInfo
             // displayContent = ""; 
          }

          return (
            <div key={index} className={messageClass}>
              <div className="message-content">
                {displayContent}
                {toolInfo}
              </div>
            </div>
          );
        })}
        {isLoading && (
            <div className="message message-assistant">
                 <div className="message-content">
                    <em>Thinking...</em>
                 </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type your message..."
            className="message-input"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="send-button"
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatInterface;
