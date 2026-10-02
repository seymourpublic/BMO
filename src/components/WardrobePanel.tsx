import React, { useState } from 'react';
import { Sheet } from './Sheet';
import { ACCESSORIES, AccessoryId, OUTFIT_COLOURS, Outfit } from '../utils/fashion';

interface WardrobePanelProps {
  chosen: Outfit | null;
  onChoose: (outfit: Outfit | null) => void;
  onClose: () => void;
}

// BMO's wardrobe: the friend picks what BMO wears (it keeps wearing it until changed)
export const WardrobePanel: React.FC<WardrobePanelProps> = ({ chosen, onChoose, onClose }) => {
  const [colour, setColour] = useState(chosen?.colour || OUTFIT_COLOURS[6]);

  const pick = (accessory: AccessoryId | null) => onChoose(accessory ? { accessory, colour } : null);
  const pickColour = (next: string) => {
    setColour(next);
    if (chosen) onChoose({ accessory: chosen.accessory, colour: next });
  };

  return (
    <Sheet title="BMO's wardrobe" onClose={onClose}>
      <h3 className="text-sm font-bold mb-2">What should BMO wear?</h3>
      <div className="grid grid-cols-3 gap-2">
        {ACCESSORIES.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => pick(item.id)}
            aria-pressed={chosen?.accessory === item.id}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 ${chosen?.accessory === item.id ? 'border-[#e43d3d] bg-white' : 'border-transparent bg-white/60 hover:bg-white'}`}
          >
            <span className="text-2xl" aria-hidden="true">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => pick(null)}
          aria-pressed={!chosen}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 ${!chosen ? 'border-[#e43d3d] bg-white' : 'border-transparent bg-white/60 hover:bg-white'}`}
        >
          <span className="text-2xl" aria-hidden="true">✨</span>
          <span className="text-xs">Nothing</span>
        </button>
      </div>

      <h3 className="text-sm font-bold mt-5 mb-2">Colour</h3>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accessory colour">
        {OUTFIT_COLOURS.map(c => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={colour === c}
            aria-label={`Colour ${c}`}
            onClick={() => pickColour(c)}
            className={`w-9 h-9 rounded-full border-2 ${colour === c ? 'border-[#173a33] scale-110' : 'border-white'} shadow transition-transform`}
            style={{ background: c }}
          />
        ))}
      </div>
      <p className="mt-4 text-xs opacity-70">At a fashion show, BMO dresses up to match your looks, then goes back to this.</p>
    </Sheet>
  );
};
