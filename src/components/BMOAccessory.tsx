import React from 'react';
import { AccessoryId } from '../utils/fashion';

// Simple drawings in BMO's flat style. `c` is the accessory colour.
// Sunglasses live in BMOFace (they follow BMO's eyes).

const shade = 'rgba(0,0,0,0.22)';
const shine = 'rgba(255,255,255,0.55)';

// On top of BMO's head
export const TopAccessory: React.FC<{ id: AccessoryId; c: string }> = ({ id, c }) => {
  const common = 'absolute left-1/2 -translate-x-1/2 bottom-full pointer-events-none bmo-accessory-on';
  switch (id) {
    case 'bow':
      return (
        <svg viewBox="0 0 60 34" className={`${common} w-[30%] -mb-[3%]`} aria-hidden="true">
          <path d="M30 17 C20 2 4 2 5 16 C6 30 20 30 30 17 Z" fill={c} stroke={shade} strokeWidth="2" />
          <path d="M30 17 C40 2 56 2 55 16 C54 30 40 30 30 17 Z" fill={c} stroke={shade} strokeWidth="2" />
          <circle cx="30" cy="17" r="6" fill={c} stroke={shade} strokeWidth="2" />
          <path d="M12 10 Q16 8 19 12" stroke={shine} strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'topHat':
      return (
        <svg viewBox="0 0 60 46" className={`${common} w-[34%] -mb-[2%]`} aria-hidden="true">
          <rect x="15" y="2" width="30" height="34" rx="3" fill="#2b2b2b" />
          <rect x="15" y="24" width="30" height="7" fill={c} />
          <rect x="3" y="35" width="54" height="8" rx="4" fill="#2b2b2b" />
          <path d="M19 6 L19 20" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'flowerCrown': {
      const flowers = [8, 20, 32, 44, 56];
      return (
        <svg viewBox="0 0 64 24" className={`${common} w-[52%] -mb-[3%]`} aria-hidden="true">
          <path d="M2 18 Q32 8 62 18" stroke="#4c9a4c" strokeWidth="4" fill="none" strokeLinecap="round" />
          {flowers.map((x, i) => {
            const y = 15 - Math.sin((x / 64) * Math.PI) * 5;
            return (
              <g key={x} transform={`translate(${x} ${y})`}>
                {[0, 72, 144, 216, 288].map(a => (
                  <ellipse key={a} cx="0" cy="-4" rx="3" ry="4" fill={i % 2 ? '#ffffff' : c} transform={`rotate(${a})`} />
                ))}
                <circle r="2.4" fill="#f3c52b" />
              </g>
            );
          })}
        </svg>
      );
    }
    case 'tiara':
      return (
        <svg viewBox="0 0 60 30" className={`${common} w-[38%] -mb-[2%]`} aria-hidden="true">
          <path d="M4 27 L10 10 L20 20 L30 3 L40 20 L50 10 L56 27 Z" fill="#f3c52b" stroke="#b8901a" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="30" cy="13" r="4" fill={c} />
          <circle cx="15" cy="21" r="2.6" fill={c} />
          <circle cx="45" cy="21" r="2.6" fill={c} />
        </svg>
      );
    default:
      return null;
  }
};

// Just under BMO's screen
export const NeckAccessory: React.FC<{ id: AccessoryId; c: string }> = ({ id, c }) => {
  if (id === 'bowTie') {
    return (
      <svg viewBox="0 0 50 24" className="absolute left-1/2 -translate-x-1/2 top-full -mt-[4%] w-[22%] pointer-events-none z-10 bmo-accessory-on" aria-hidden="true">
        <path d="M25 12 L4 2 L4 22 Z" fill={c} stroke={shade} strokeWidth="2" strokeLinejoin="round" />
        <path d="M25 12 L46 2 L46 22 Z" fill={c} stroke={shade} strokeWidth="2" strokeLinejoin="round" />
        <rect x="20" y="6" width="10" height="12" rx="3" fill={c} stroke={shade} strokeWidth="2" />
      </svg>
    );
  }
  if (id === 'scarf') {
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute -left-[4%] top-full -mt-[3%] w-[108%] h-[24%] pointer-events-none z-10 bmo-accessory-on" aria-hidden="true">
        <rect x="0" y="1" width="100" height="16" rx="8" fill={c} />
        <path d="M68 10 L86 10 L84 39 L70 39 Z" fill={c} />
        <path d="M0 6 L100 6" stroke={shine} strokeWidth="2" />
        <path d="M72 28 L82 28 M71 34 L83 34" stroke={shade} strokeWidth="2" />
      </svg>
    );
  }
  return null;
};

// Behind BMO
export const Cape: React.FC<{ c: string }> = ({ c }) => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute -left-[9%] -right-[9%] top-[6%] -bottom-[5%] w-[118%] h-[99%] pointer-events-none bmo-cape bmo-accessory-on" aria-hidden="true">
    <path d="M18 0 L82 0 L100 100 Q75 92 50 100 Q25 92 0 100 Z" fill={c} />
    <path d="M18 0 L82 0 L84 6 L16 6 Z" fill={shade} />
  </svg>
);
