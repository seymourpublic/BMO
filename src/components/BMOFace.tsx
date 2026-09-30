import React, { memo, useEffect, useState } from 'react';
import { Mood } from '../types';

export type LookDirection = 'left' | 'right' | 'up' | 'down';

// How far the face shifts when BMO looks around (SVG units)
const LOOK_OFFSETS: Record<LookDirection, [number, number]> = {
  left: [-7, 0], right: [7, 0], up: [0, -5], down: [0, 5]
};

interface BMOFaceProps {
  mood: Mood;
  look?: LookDirection | null;
  eyesClosed?: boolean;  // Slow blink while idle
  faceColor: string;
  asleep?: boolean;
  listening?: boolean;
  speaking?: boolean;
  singing?: boolean;
  // Voice loudness 0-1 while speaking, or -1 if it can't be measured
  getMouthLevel?: () => number;
}

type MouthFrame = 0 | 1 | 2;  // closed, half open, open

// Loudness thresholds for the half-open and open mouth
const HALF_OPEN_LEVEL = 0.12;
const OPEN_LEVEL = 0.35;
// Hold each mouth shape at least this long so it flaps like a cartoon instead of flickering
const MIN_FRAME_MS = 70;
// How much each new loudness reading counts vs the running average (0-1)
const LEVEL_SMOOTHING = 0.45;

const levelToFrame = (level: number): MouthFrame =>
  level >= OPEN_LEVEL ? 2 : level >= HALF_OPEN_LEVEL ? 1 : 0;

// Drive mouth flaps from the voice's loudness, or a random timer if it can't be measured
const useMouthFrame = (active: boolean, getMouthLevel?: () => number): MouthFrame => {
  const [frame, setFrame] = useState<MouthFrame>(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }
    let rafId = 0;
    let timerId = 0;
    let current: MouthFrame = 0;
    let lastChange = 0;
    let smoothedLevel = 0;
    const show = (next: MouthFrame) => {
      if (next !== current) {
        current = next;
        lastChange = performance.now();
        setFrame(next);  // Only re-render when the mouth shape changes
      }
    };

    const flapOnTimer = () => {
      const options = ([0, 1, 2] as MouthFrame[]).filter(f => f !== current);
      show(options[Math.floor(Math.random() * options.length)]);
      timerId = window.setTimeout(flapOnTimer, 110 + Math.random() * 70);
    };

    const followVoice = () => {
      const level = getMouthLevel ? getMouthLevel() : -1;
      if (level < 0) {
        flapOnTimer();  // Switch to the fallback for the rest of this clip
        return;
      }
      smoothedLevel += (level - smoothedLevel) * LEVEL_SMOOTHING;
      if (performance.now() - lastChange >= MIN_FRAME_MS) {
        show(levelToFrame(smoothedLevel));
      }
      rafId = requestAnimationFrame(followVoice);
    };

    followVoice();
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [active, getMouthLevel]);

  return frame;
};

const Eyes: React.FC<{ mood: Mood; asleep?: boolean; listening?: boolean; c: string }> = ({ mood, asleep, listening, c }) => {
  if (asleep) {
    return (
      <>
        <path d="M26 24 Q32 30 38 24" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M82 24 Q88 30 94 24" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (listening) {
    return (
      <g className="bmo-blink">
        <ellipse cx="32" cy="20" rx="6" ry="9" fill={c} />
        <ellipse cx="88" cy="20" rx="6" ry="9" fill={c} />
      </g>
    );
  }
  switch (mood) {
    case 'excited':
      return (
        <>
          <path d="M24 26 Q32 14 40 26" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M80 26 Q88 14 96 26" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      );
    case 'surprised':
      return (
        <g className="bmo-blink">
          <ellipse cx="32" cy="20" rx="6" ry="9" fill={c} />
          <ellipse cx="88" cy="20" rx="6" ry="9" fill={c} />
        </g>
      );
    case 'sad':
      return (
        <g className="bmo-blink">
          <ellipse cx="32" cy="24" rx="5" ry="7" fill={c} />
          <ellipse cx="88" cy="24" rx="5" ry="7" fill={c} />
          {/* Brows slope up toward the middle (sloping down would look angry) */}
          <path d="M24 16 L38 11" stroke={c} strokeWidth="3" strokeLinecap="round" />
          <path d="M96 16 L82 11" stroke={c} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'thinking':
      return (
        <>
          <ellipse className="bmo-blink" cx="32" cy="22" rx="5" ry="7" fill={c} />
          <path d="M80 22 L96 22" stroke={c} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'confused':
      return (
        <g className="bmo-blink">
          <ellipse cx="32" cy="22" rx="5" ry="7" fill={c} />
          <ellipse cx="88" cy="20" rx="7" ry="9" fill={c} />
        </g>
      );
    default:
      return (
        <g className="bmo-blink">
          <ellipse cx="32" cy="22" rx="5" ry="7" fill={c} />
          <ellipse cx="88" cy="22" rx="5" ry="7" fill={c} />
        </g>
      );
  }
};

// Style A: smile that opens into a "D" (talking)
const TalkMouth: React.FC<{ frame: MouthFrame; c: string }> = ({ frame, c }) => {
  if (frame === 0) return <path d="M44 46 Q60 54 76 46" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
  if (frame === 1) return <path d="M44 42 Q60 58 76 42 Q60 48 44 42 Z" fill={c} stroke={c} strokeWidth="2" strokeLinejoin="round" />;
  return <path d="M42 38 Q60 68 78 38 Q60 44 42 38 Z" fill={c} stroke={c} strokeWidth="2" strokeLinejoin="round" />;
};

// Style B: round "O" with a little tongue (singing)
const SingMouth: React.FC<{ frame: MouthFrame; c: string }> = ({ frame, c }) => {
  if (frame === 0) return <path d="M48 48 L72 48" stroke={c} strokeWidth="4" strokeLinecap="round" />;
  if (frame === 1) return <ellipse cx="60" cy="48" rx="10" ry="5" fill={c} />;
  return (
    <>
      <ellipse cx="60" cy="48" rx="12" ry="11" fill={c} />
      <ellipse cx="60" cy="54" rx="7" ry="3.5" fill="#e0707a" />
    </>
  );
};

const RestingMouth: React.FC<{ mood: Mood; asleep?: boolean; listening?: boolean; c: string }> = ({ mood, asleep, listening, c }) => {
  if (asleep) return <path d="M54 48 L66 48" stroke={c} strokeWidth="3.5" strokeLinecap="round" />;
  if (listening) return <path d="M50 46 Q60 52 70 46" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
  switch (mood) {
    case 'excited':
      return <path d="M40 38 Q60 70 80 38 Z" fill={c} stroke={c} strokeWidth="2" strokeLinejoin="round" />;
    case 'surprised':
      return <ellipse cx="60" cy="48" rx="8" ry="10" fill={c} />;
    case 'sad':
      return <path d="M44 54 Q60 40 76 54" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
    case 'thinking':
      return <path d="M46 48 L74 44" stroke={c} strokeWidth="4" strokeLinecap="round" />;
    case 'confused':
      return <path d="M44 48 Q52 42 60 48 T76 48" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M42 42 Q60 60 78 42" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
  }
};

export const BMOFace: React.FC<BMOFaceProps> = memo(({
  mood, look, eyesClosed, faceColor, asleep, listening, speaking, singing, getMouthLevel
}) => {
  const flapping = !!(speaking && !asleep);
  const frame = useMouthFrame(flapping, getMouthLevel);
  const [dx, dy] = look && !asleep ? LOOK_OFFSETS[look] : [0, 0];

  return (
    <svg viewBox="0 0 120 70" className="w-full h-full overflow-visible" role="img" aria-label={asleep ? 'BMO is asleep' : `BMO looks ${mood}`}>
      <g style={{ transform: `translate(${dx}px, ${dy}px)`, transition: 'transform 180ms ease-out' }}>
      <Eyes mood={mood} asleep={asleep || eyesClosed} listening={listening} c={faceColor} />
      {flapping
        ? (singing ? <SingMouth frame={frame} c={faceColor} /> : <TalkMouth frame={frame} c={faceColor} />)
        : <RestingMouth mood={mood} asleep={asleep} listening={listening} c={faceColor} />}
      {asleep && (
        <text x="100" y="14" fontSize="9" fontWeight="bold" fill={faceColor} className="bmo-zzz">z</text>
      )}
      {mood === 'thinking' && !speaking && !asleep && (
        <g className="bmo-think-dots" fill={faceColor}>
          <circle cx="102" cy="10" r="2" />
          <circle cx="108" cy="6" r="1.5" />
          <circle cx="113" cy="3" r="1" />
        </g>
      )}
      </g>
    </svg>
  );
});
