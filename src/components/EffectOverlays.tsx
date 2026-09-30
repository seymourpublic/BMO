import React from 'react';

export type FlashKind = 'chop' | 'alarm';

interface EffectOverlaysProps {
  flash: { kind: FlashKind; id: number } | null;  // `id` restarts the animation
  fireworks: boolean;
}

// Full-screen effects for easter eggs: the BMO Chop / stranger-alarm flash and Konami fireworks
export const EffectOverlays: React.FC<EffectOverlaysProps> = ({ flash, fireworks }) => (
  <>
    {flash && (
      <div
        key={flash.id}
        aria-hidden="true"
        className={`fixed inset-0 z-40 pointer-events-none opacity-0 ${flash.kind === 'alarm' ? 'bmo-flash-alarm bg-[#ff2b2b]' : 'bmo-flash bg-white'}`}
      />
    )}
    {fireworks && (
      <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden="true">
        {['🎆', '🎇', '✨', '🎆', '🌈', '🎇', '✨'].map((spark, i) => (
          <span
            key={i}
            className="absolute text-5xl bmo-firework"
            style={{ left: `${8 + i * 13}%`, top: `${45 + (i % 3) * 12}%`, animationDelay: `${i * 0.2}s` }}
          >
            {spark}
          </span>
        ))}
      </div>
    )}
  </>
);
