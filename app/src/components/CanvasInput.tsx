import { Clock, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CanvasInputProps {
  onCommand?: (command: string) => void;
}

export const CanvasInput: React.FC<CanvasInputProps> = ({ onCommand }) => {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      // Add to history
      setCommandHistory(prev => [input.trim(), ...prev.slice(0, 9)]); // Keep last 10 commands
      
      // Call the onCommand callback
      onCommand?.(input.trim());
      
      // Clear input
      setInput('');
    }
  };

  const handleHistoryItemClick = (command: string) => {
    setInput(command);
    setShowHistory(false);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !historyButtonRef.current?.contains(event.target as Node)
      ) {
        setShowHistory(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full">
      {/* History Popover */}
      {showHistory && (
        <div
          ref={popoverRef}
          className="absolute bottom-full -left-6 mb-2 w-full max-w-sm bg-white rounded-xl shadow-lg border border-gray-200 z-20 max-h-64 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-100">
            <div className="text-sm font-medium text-gray-700">Command History</div>
          </div>
          
          <div className="py-1 max-h-48 overflow-y-auto">
            {commandHistory.length > 0 ? (
              commandHistory.map((command, index) => (
                <button
                  key={index}
                  onClick={() => handleHistoryItemClick(command)}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:text-blue-600 transition-colors duration-150 border border-white"
                  style={{ borderBottom: index === commandHistory.length - 1 ? 'none' : '' }}
                >
                  <div className="truncate">{command}</div>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-gray-500 text-center font-medium">
                No command history yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Pill */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center bg-white rounded-full border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
          {/* History Button */}
          <button
            ref={historyButtonRef}
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center justify-center w-10 h-10 ml-1 rounded-full border transition-all duration-150 ${
              showHistory 
                ? 'border-blue-300 bg-blue-100 text-blue-600 hover:bg-blue-200 hover:border-blue-400' 
                : 'border-gray-300 bg-gray-100 text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600'
            }`}
            title="Command History"
          >
            <Clock size={16} />
          </button>

          {/* Input Field */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what you want to do..."
            className="flex-1 px-4 py-3 bg-transparent border-none outline-none text-gray-700 placeholder-gray-400 text-sm font-medium"
            autoComplete="off"
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!input.trim()}
            className={`flex items-center justify-center w-10 h-10 mr-1 rounded-full border transition-all duration-150 ${
              input.trim()
                ? 'border-blue-300 bg-blue-100 text-blue-600 hover:bg-blue-200 hover:border-blue-400'
                : 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed hover:border-gray-300 hover:bg-gray-100'
            }`}
            title="Send Command"
          >
            <Send 
              size={16} 
              className={input.trim() ? 'transform group-hover:translate-x-0.5 transition-transform duration-150' : ''}
            />
          </button>
        </div>
      </form>
    </div>
  );
};
