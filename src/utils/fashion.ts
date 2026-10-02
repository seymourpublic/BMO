// BMO's fashion show: accessories BMO can wear, the friend's chosen outfit for BMO, and the show's rules

export type AccessoryId = 'bow' | 'topHat' | 'flowerCrown' | 'tiara' | 'sunglasses' | 'bowTie' | 'scarf' | 'cape';

export const ACCESSORIES: Array<{ id: AccessoryId; label: string; icon: string }> = [
  { id: 'bow', label: 'Bow', icon: '🎀' },
  { id: 'topHat', label: 'Top hat', icon: '🎩' },
  { id: 'flowerCrown', label: 'Flower crown', icon: '🌸' },
  { id: 'tiara', label: 'Tiara', icon: '👑' },
  { id: 'sunglasses', label: 'Sunglasses', icon: '🕶️' },
  { id: 'bowTie', label: 'Bow tie', icon: '🎗️' },
  { id: 'scarf', label: 'Scarf', icon: '🧣' },
  { id: 'cape', label: 'Cape', icon: '🦸' }
];

export const OUTFIT_COLOURS = ['#e43d3d', '#f39c34', '#f3c52b', '#43b649', '#3fa7d6', '#7e57c2', '#ec6fa9', '#ffffff'];

export interface Outfit {
  accessory: AccessoryId;
  colour: string;  // #rrggbb ('' = BMO's theme colour)
}

const HEX = /^#[0-9a-f]{6}$/i;
export const isAccessory = (value: unknown): value is AccessoryId => ACCESSORIES.some(a => a.id === value);
export const safeColour = (colour: string | undefined, fallback: string): string => (colour && HEX.test(colour) ? colour : fallback);

// What BMO is wearing: a look from the show (until it next wakes) wins over the friend's choice
export const wornOutfit = (showOutfit: Outfit | null, chosen: Outfit | null): Outfit | null => showOutfit ?? chosen;

// --- The friend's choice, kept on this device ---
const STORAGE_KEY = 'bmo-outfit-v1';

export const loadOutfit = (): Outfit | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved && isAccessory(saved.accessory) ? { accessory: saved.accessory, colour: HEX.test(saved.colour) ? saved.colour : '' } : null;
  } catch {
    return null;
  }
};

export const saveOutfit = (outfit: Outfit | null) => {
  try {
    if (outfit) localStorage.setItem(STORAGE_KEY, JSON.stringify(outfit));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not critical
  }
};

// --- The show ---
export const MAX_LOOKS = 6;
export const RUNWAY_COUNTDOWN = 5;  // Seconds to step back and pose
export const CHECK_COUNTDOWN = 3;

export interface Look {
  award: string;
  comment: string;
  tip?: string;
  accessory: AccessoryId;
  colour: string;
  photo: Blob;  // Album-sized copy (shown at the finale, saved if the settings allow)
}

// "That's all", "finale", "I'm done" end the show
export const wantsFinale = (text: string): boolean =>
  /\b(that'?s (all|it)|finale|the end|i'?m done|we'?re done|no more( looks)?|end the show)\b/i.test(text);

// "Ready", "next look", "go" take the next photo
export const wantsNextLook = (text: string): boolean =>
  /\b(ready|next( look)?|go|i'?m ready|take it|cheese|okay|ok)\b/i.test(text);

// After this look, is it time for the finale?
export const showIsFull = (looks: number): boolean => looks >= MAX_LOOKS;

// If the judge couldn't answer: every look still wins
export const FALLBACK_JUDGING = {
  award: 'Most Fabulous',
  comment: "BMO's judging circuits are dazzled! You win!",
  accessory: 'bow' as AccessoryId,
  colour: ''
};
