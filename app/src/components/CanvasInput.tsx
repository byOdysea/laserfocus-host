import { Clock, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CanvasInputProps {
  onCommand?: (command: string) => void;
  isLoading?: boolean;
}

export const CanvasInput: React.FC<CanvasInputProps> = ({ onCommand, isLoading }) => {
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
    <div className="relative w-full font-sans">
      {/* History Popover */}
      {showHistory && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 mb-2 w-full max-w-md bg-white rounded-lg shadow-2xl border border-gray-200 z-20 max-h-80 overflow-hidden flex flex-col"
          style={{ transform: 'translateY(-8px)'}} // Small offset to avoid overlap with input
        >
          <div className="px-4 py-3 border-b border-gray-200 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">Command History</h3>
          </div>
          
          <div className="flex-grow py-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 scrollbar-track-slate-100">
            {commandHistory.length > 0 ? (
              commandHistory.map((command, index) => (
                <button
                  key={index}
                  onClick={() => handleHistoryItemClick(command)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-500 hover:text-white transition-all duration-150 focus:outline-none focus:bg-blue-500 focus:text-white group"
                >
                  <div className="truncate group-hover:font-medium">{command}</div>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">
                <Clock size={24} className="mx-auto mb-2 text-slate-400" />
                No command history yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input Pill */}
      <form onSubmit={handleSubmit} className="relative group">
        <div className="flex items-center bg-white rounded-full border border-slate-300 shadow-sm hover:shadow-lg group-focus-within:shadow-lg transition-all duration-300 ease-in-out focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
          {/* History Button */}
          <button
            ref={historyButtonRef}
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            disabled={isLoading}
            className={`flex items-center justify-center w-10 h-10 ml-1.5 rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400 ${ 
              showHistory 
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}
            title="Command History"
          >
            <Clock size={18} />
          </button>

          {/* Input Field */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "Processing..." : "Enter your command..."}
            className="flex-1 px-4 py-3 bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 text-sm font-medium tracking-wide"
            autoComplete="off"
            disabled={isLoading}
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`flex items-center justify-center w-10 h-10 mr-1.5 rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400 ${ 
              input.trim()
                ? 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 transform active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
            title="Send Command"
          >
            <Send 
              size={18} 
              className={input.trim() ? 'transform transition-transform duration-150 ease-in-out group-hover:translate-x-px' : ''}
            />
          </button>
        </div>
      </form>
    </div>
  );
};
