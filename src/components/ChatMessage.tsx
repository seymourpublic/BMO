import React from 'react';

interface ChatMessageProps {
  sender: 'user' | 'bmo';
  content: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ sender, content }) => {
  return (
    <div className={`mb-3 animate-slideIn ${sender === 'user' ? 'text-[#1a5f7a]' : 'text-[#2a5d5f]'}`}>
      <div className="font-bold text-[11px] uppercase tracking-wide mb-1 font-press-start">
        {sender === 'user' ? 'YOU' : 'BMO'}
      </div>
      <div className={sender === 'user' ? 'font-semibold' : ''}>
        {content}
      </div>
    </div>
  );
};
