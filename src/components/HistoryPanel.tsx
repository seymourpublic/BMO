import React, { useEffect, useRef } from 'react';
import { DisplayMessage } from '../hooks/useBMOConversation';
import { Sheet } from './Sheet';

interface HistoryPanelProps {
  messages: DisplayMessage[];
  onClose: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ messages, onClose }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, []);

  return (
    <Sheet title="Past messages" onClose={onClose}>
      {messages.length === 0 ? (
        <p className="text-center text-sm opacity-70 py-8">Nothing yet. Press the red button and say hi to BMO!</p>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                msg.role === 'user'
                  ? 'self-end bg-[#2d4f9e] text-white rounded-br-sm'
                  : 'self-start bg-[#c6f3d2] text-[#15241f] rounded-bl-sm'
              }`}
            >
              {msg.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </Sheet>
  );
};
