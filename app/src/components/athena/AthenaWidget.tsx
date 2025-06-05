import { Bot, Loader2, MessageSquareText } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface AthenaWidgetProps {
  messages: any[]; // Accept any message type from useStream
  isLoading: boolean;
}

export const AthenaWidget: React.FC<AthenaWidgetProps> = ({ messages, isLoading: isAthenaThinking }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialWidgetLoading, setInitialWidgetLoading] = useState<boolean>(false);
  const initialLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Effect for initial widget loading state
  useEffect(() => {
    if (messages.length === 0 && !isAthenaThinking) {
      setInitialWidgetLoading(true);
      initialLoadTimeoutRef.current = setTimeout(() => {
        setInitialWidgetLoading(false);
      }, 1); // 20 seconds timeout
    }

    return () => {
      if (initialLoadTimeoutRef.current) {
        clearTimeout(initialLoadTimeoutRef.current);
      }
    };
  }, []); // Run only on mount

  // Effect to clear initial loading if messages arrive or Athena starts thinking
  useEffect(() => {
    if (initialWidgetLoading && (messages.length > 0 || isAthenaThinking)) {
      setInitialWidgetLoading(false);
      if (initialLoadTimeoutRef.current) {
        clearTimeout(initialLoadTimeoutRef.current);
      }
    }
  }, [messages, isAthenaThinking, initialWidgetLoading]);

  // Get the message content from various formats
  const getMessageContent = (msg: any): string => {
    if (!msg) return '';
    
    // For BaseMessage format or plain object format
    if (msg.content && typeof msg.content === 'string') {
      return msg.content;
    }
    
    // For other potential formats
    if (msg.text && typeof msg.text === 'string') {
      return msg.text;
    }
    
    if (msg.message && typeof msg.message === 'string') {
      return msg.message;
    }
    
    return '';
  };

  // Filter messages to display only AI/assistant responses with actual textual content
  const displayMessages = messages.filter(msg => {
    let isAIMessage = false;
    if (msg._getType && typeof msg._getType === 'function') {
      isAIMessage = msg._getType() === 'ai';
    } else if (msg.type && typeof msg.type === 'string') {
      isAIMessage = msg.type === 'ai';
    } else if (msg.role && typeof msg.role === 'string') {
      isAIMessage = msg.role === 'assistant' || msg.role === 'ai';
    }

    if (isAIMessage) {
      // Check for actual content, not just tool calls
      const content = getMessageContent(msg); // Use the existing content extraction logic
      return content.trim() !== '';
    }
    return false;
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages, initialWidgetLoading, isAthenaThinking]);

  return (
    <div className="w-full h-60 bg-slate-800 text-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden font-sans">
      {/* Enhanced header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2 bg-slate-800/50 backdrop-blur-sm">
        <Bot className="w-5 h-5 text-purple-400" />
        <span className="text-sm font-semibold text-slate-100">Athena Assistant</span>
        {(isAthenaThinking || initialWidgetLoading) && (
          <div className="ml-auto flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          </div>
        )}
      </div>
      
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 scrollbar-track-slate-700/50">
        {initialWidgetLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mb-3" />
            <p className="text-sm font-medium">Initializing Athena...</p>
            <p className="text-xs text-slate-500">Please wait a moment.</p>
          </div>
        ) : displayMessages.length === 0 && !isAthenaThinking ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
            <MessageSquareText className="w-10 h-10 text-slate-500 mb-3" />
            <p className="text-sm font-medium">Athena is ready.</p>
            <p className="text-xs text-slate-500">Ask anything or wait for automated insights.</p>
          </div>
        ) : (
          displayMessages.map((msg, idx) => (
            <div key={idx} className="text-sm text-slate-200 leading-relaxed bg-slate-700/50 p-3 rounded-lg shadow self-start max-w-[85%]">
              {getMessageContent(msg)}
            </div>
          ))
        )}
        {isAthenaThinking && !initialWidgetLoading && (
          <div className="flex items-center gap-2 text-sm text-purple-300 pt-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Athena is thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
};
