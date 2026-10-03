// Crisis mode on the device. The server decides the level (crisis.js); the app keeps the state
// for the visit and changes how BMO behaves. Spec: docs/superpowers/specs/2026-10-03-crisis-mode-design.md

export interface CrisisState {
  level: number;      // 0 normal … 6 in danger
  kind: string;       // What sort of feeling (stress, grief, panic…)
  calmStreak: number; // Calm turns in a row (the server steps down after a few)
  floor: number;      // Lowest level for the rest of this visit
}

export const NO_CRISIS: CrisisState = { level: 0, kind: 'none', calmStreak: 0, floor: 0 };

// From this level BMO doesn't start fun things itself (nudges, idle songs, dreams, milestones, surprises)
export const QUIET_FROM = 2;
// From this level play is off (games, pokes, modes, jokes) and BMO stays with the friend
export const SUPPORTIVE_FROM = 4;
// Messages from this level are private: never sent for memory, notes or the diary
export const PRIVATE_FROM = 3;
// After this level, the next wake is calm too
const CALM_NEXT_WAKE_FROM = 5;

const STORAGE_KEY = 'bmo-crisis-v1';
const RESTORE_WITHIN_MS = 2 * 60 * 60 * 1000;   // A reload mid-conversation keeps the state
const CALM_WAKE_WITHIN_MS = 24 * 60 * 60 * 1000; // The day after a hard moment starts gently

interface Saved {
  state: CrisisState;
  at: number;
  peak: number;     // Highest level this visit
  peakAt: number;
}

const clean = (raw: Partial<CrisisState> | undefined): CrisisState => ({
  level: Number.isInteger(raw?.level) ? Math.min(6, Math.max(0, raw!.level!)) : 0,
  kind: typeof raw?.kind === 'string' ? raw.kind : 'none',
  calmStreak: Number.isInteger(raw?.calmStreak) ? Math.max(0, raw!.calmStreak!) : 0,
  floor: Number.isInteger(raw?.floor) ? Math.min(4, Math.max(0, raw!.floor!)) : 0
});

const read = (): Saved | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved && typeof saved.at === 'number' ? { ...saved, state: clean(saved.state) } : null;
  } catch {
    return null;
  }
};

// The crisis state when BMO opens: restored only if it was very recent
export const loadCrisis = (now = Date.now()): CrisisState => {
  const saved = read();
  return saved && now - saved.at < RESTORE_WITHIN_MS ? saved.state : NO_CRISIS;
};

export const saveCrisis = (state: CrisisState, now = Date.now()) => {
  try {
    const saved = read();
    const recentPeak = saved && now - saved.peakAt < CALM_WAKE_WITHIN_MS ? saved : null;
    const peak = Math.max(state.level, recentPeak?.peak ?? 0);
    const peakAt = state.level >= (recentPeak?.peak ?? 0) ? now : recentPeak!.peakAt;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, at: now, peak, peakAt }));
  } catch {
    // Not critical
  }
};

export const clearCrisis = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
};

// After a dangerous moment, the next wake is calm: no alarms, jokes, dreams or celebrations
export const calmWake = (now = Date.now()): boolean => {
  const saved = read();
  return !!saved && saved.peak >= CALM_NEXT_WAKE_FROM && now - saved.peakAt < CALM_WAKE_WITHIN_MS;
};

// "Breathe with BMO", "help me breathe"
export const wantsBreathing = (text: string): boolean =>
  /\bbreathe with (bmo|me|you)\b|\bhelp me breathe\b|\bbreathing (exercise|together)\b|\blet'?s breathe\b/i.test(text);

// Saying yes when BMO asked "Can BMO check on you tomorrow?"
export const asksToCheckIn = (bmoSaid: string): boolean => /\bcheck (on|in on) you\b/i.test(bmoSaid);
export const saysYes = (text: string): boolean =>
  /^(yes|yeah|yep|ok(ay)?|sure|please|that would be (nice|good)|you can|i'?d like that)\b/i.test(text.trim());

// Faces that are too bright for a hard moment soften to calm
const BRIGHT_MOODS = ['happy', 'excited', 'starry', 'love', 'blushing', 'pouty'];
export const softenMood = <M extends string>(mood: M, level: number): M | 'calm' =>
  level >= PRIVATE_FROM && BRIGHT_MOODS.includes(mood) ? 'calm' : mood;
