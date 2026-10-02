import React, { useState } from 'react';
import { Sheet } from './Sheet';
import { ShoppingItem } from '../utils/shoppingList';

interface ShoppingListPanelProps {
  items: ShoppingItem[];
  onAdd: (text: string) => void;
  onToggle: (index: number) => void;
  onClearDone: () => void;
  onClose: () => void;
}

// The friend's shopping list: tap to tick things off as they're bought
export const ShoppingListPanel: React.FC<ShoppingListPanelProps> = ({ items, onAdd, onToggle, onClearDone, onClose }) => {
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText('');
  };

  return (
    <Sheet title="Shopping list" onClose={onClose}>
      <form className="flex gap-2 mb-3" onSubmit={e => { e.preventDefault(); add(); }}>
        <input
          type="text"
          value={text}
          maxLength={80}
          onChange={e => setText(e.target.value)}
          placeholder="Add something…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-full px-4 py-2 text-sm font-bold text-white bg-[#43b649]">Add</button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm opacity-70 text-center py-4">Nothing to buy! When you're cooking, tell BMO what you don't have.</p>
      ) : (
        <>
          <ul className="divide-y rounded-xl bg-white border">
            {items.map((item, i) => (
              <li key={`${item.text}-${i}`}>
                <button type="button" onClick={() => onToggle(i)} aria-pressed={item.done} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm">
                  <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${item.done ? 'bg-[#43b649] border-[#43b649] text-white' : 'border-[#9bb]'}`}>
                    {item.done ? '✓' : ''}
                  </span>
                  <span className={item.done ? 'line-through opacity-50' : ''}>{item.text}</span>
                </button>
              </li>
            ))}
          </ul>
          {items.some(i => i.done) && (
            <button type="button" onClick={onClearDone} className="mt-3 text-sm font-semibold text-[#c62828] underline underline-offset-2">
              Clear ticked items
            </button>
          )}
        </>
      )}
    </Sheet>
  );
};
