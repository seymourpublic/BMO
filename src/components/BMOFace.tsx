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
  sunglasses?: string;  // Frame colour when BMO is wearing sunglasses (fashion show / wardrobe)
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

// A heart shape centred on (x, y)
const heartPath = (x: number, y: number, size: number) =>
  `M${x} ${y + size * 0.9} C${x - size * 1.6} ${y - size * 0.2} ${x - size * 0.7} ${y - size * 1.3} ${x} ${y - size * 0.35} ` +
  `C${x + size * 0.7} ${y - size * 1.3} ${x + size * 1.6} ${y - size * 0.2} ${x} ${y + size * 0.9} Z`;

// A five-pointed star centred on (x, y)
const starPoints = (x: number, y: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

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
    case 'love':
      return (
        <g className="bmo-heartbeat">
          <path d={heartPath(32, 22, 7)} fill="#e43d5a" />
          <path d={heartPath(88, 22, 7)} fill="#e43d5a" />
        </g>
      );
    case 'crying':
      return (
        <>
          <path d="M24 24 Q32 18 40 24" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M80 24 Q88 18 96 24" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* Tears that drip down */}
          <ellipse className="bmo-tear" cx="30" cy="30" rx="2.2" ry="3.2" fill="#5aa9e6" />
          <ellipse className="bmo-tear bmo-tear-late" cx="90" cy="30" rx="2.2" ry="3.2" fill="#5aa9e6" />
        </>
      );
    case 'sleepy':
      return (
        <>
          <path d="M25 24 L39 24" stroke={c} strokeWidth="4" strokeLinecap="round" />
          <path d="M81 24 L95 24" stroke={c} strokeWidth="4" strokeLinecap="round" />
          <path d="M27 24 Q32 29 37 24" fill={c} />
          <path d="M83 24 Q88 29 93 24" fill={c} />
        </>
      );
    case 'starry':
      return (
        <g className="bmo-twinkle">
          <polygon points={starPoints(32, 21, 9)} fill={c} />
          <polygon points={starPoints(88, 21, 9)} fill={c} />
        </g>
      );
    case 'blushing':
      return (
        <>
          <path d="M25 24 Q32 18 39 24" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M81 24 Q88 18 95 24" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />
          <ellipse cx="22" cy="36" rx="8" ry="4.5" fill="#f28ba8" opacity="0.7" />
          <ellipse cx="98" cy="36" rx="8" ry="4.5" fill="#f28ba8" opacity="0.7" />
        </>
      );
    case 'pouty':
      return (
        <g className="bmo-blink">
          <ellipse cx="32" cy="24" rx="5" ry="6" fill={c} />
          <ellipse cx="88" cy="24" rx="5" ry="6" fill={c} />
          {/* Grumpy brows slope down toward the middle */}
          <path d="M24 11 L39 16" stroke={c} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M96 11 L81 16" stroke={c} strokeWidth="3.5" strokeLinecap="round" />
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
    case 'love':
      return <path d="M42 42 Q60 62 78 42" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
    case 'crying':
      return <path d="M44 54 Q50 46 56 52 Q62 46 68 52 Q72 47 76 54" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    case 'sleepy':
      return <ellipse className="bmo-yawn" cx="60" cy="49" rx="6" ry="7" fill={c} />;
    case 'starry':
      return <path d="M40 40 Q60 70 80 40 Z" fill={c} stroke={c} strokeWidth="2" strokeLinejoin="round" />;
    case 'blushing':
      return <path d="M50 47 Q60 53 70 47" stroke={c} strokeWidth="3.5" fill="none" strokeLinecap="round" />;
    case 'pouty':
      return <path d="M50 52 Q60 44 70 52" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
    default:
      return <path d="M42 42 Q60 60 78 42" stroke={c} strokeWidth="4" fill="none" strokeLinecap="round" />;
  }
};

export const BMOFace: React.FC<BMOFaceProps> = memo(({
  mood, look, eyesClosed, faceColor, asleep, listening, speaking, singing, getMouthLevel, sunglasses
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
      {sunglasses && !asleep && (
        <g className="bmo-accessory-on" aria-hidden="true">
          <rect x="18" y="10" width="28" height="20" rx="7" fill="#1d1d1d" stroke={sunglasses} strokeWidth="3" />
          <rect x="74" y="10" width="28" height="20" rx="7" fill="#1d1d1d" stroke={sunglasses} strokeWidth="3" />
          <path d="M46 17 Q60 11 74 17" fill="none" stroke={sunglasses} strokeWidth="3" />
          <path d="M23 15 L30 15" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <path d="M79 15 L86 15" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </g>
      )}
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
