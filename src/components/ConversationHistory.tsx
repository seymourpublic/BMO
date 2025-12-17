import React from 'react';
import { ConversationMessage } from '../utils/userAuth';

interface ConversationHistoryProps {
  messages: ConversationMessage[];
  onClear: () => void;
}

export const ConversationHistory: React.FC<ConversationHistoryProps> = ({ messages, onClear }) => {
  if (messages.length === 0) {
    return (
      <div className="text-center p-6 text-[#4fb8b9] text-sm">
        No conversation history yet. Start chatting with BMO!
      </div>
    );
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-black/20 rounded-xl p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-press-start text-xs text-[#8ee4d4]">Chat History</h3>
        <button
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear
        </button>
      </div>
      
      <div className="space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-[#2d6d6e] ml-8'
                : 'bg-[#4fb8b9]/20 mr-8'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">
                {msg.role === 'user' ? '👤' : '🎮'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white break-words">
                  {msg.content}
                </p>
                <p className="text-[10px] text-[#8ee4d4]/60 mt-1">
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
