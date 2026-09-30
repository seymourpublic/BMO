import React, { useEffect, useRef, useState } from 'react';

interface TypeBarProps {
  initialText?: string;
  disabled?: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

// Slide-up text box for typing to BMO
export const TypeBar: React.FC<TypeBarProps> = ({ initialText = '', disabled, onSend, onClose }) => {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    onClose();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 bg-[#173a33]/95 animate-sheet-up">
      <form
        className="mx-auto max-w-md flex gap-2"
        onSubmit={e => { e.preventDefault(); submit(); }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
          placeholder="Say something to BMO…"
          aria-label="Message to BMO"
          maxLength={2000}
          className="flex-1 min-w-0 rounded-full px-4 py-3 text-base bg-white text-[#173a33] outline-none focus:ring-4 focus:ring-[#65c3ab]/60"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-full px-5 py-3 font-bold text-white bg-[#43b649] disabled:opacity-50"
        >
          Send
        </button>
        <button type="button" onClick={onClose} aria-label="Close typing" className="rounded-full w-12 text-white/80 text-xl">✕</button>
      </form>
    </div>
  );
};
