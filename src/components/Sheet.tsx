import React, { useEffect } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

// Bottom sheet on phones, centred card on larger screens. Esc or tapping outside closes it.
export const Sheet: React.FC<SheetProps> = ({ title, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="w-full sm:max-w-md max-h-[80vh] flex flex-col bg-[#f4fbf8] text-[#173a33] rounded-t-2xl sm:rounded-2xl shadow-2xl animate-sheet-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full text-xl hover:bg-black/5">✕</button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
