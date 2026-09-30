// BMO's memory of the friend it talks to. Stored only on this device.

export interface Profile {
  name: string;         // '' until known
  pronouns: string;     // '' until the friend says; never guessed
  personality: string;  // Short description, e.g. "playful, loves puns"
}

export type ProfileField = keyof Profile;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
  kind?: 'story';  // Shown differently in past messages
}

export interface BMOMemory {
  profile: Profile;
  userEdited: Record<ProfileField, boolean>;  // Fields the friend edited win over BMO's guesses
  notes: string[];
  history: HistoryMessage[];
  stats: {
    visits: number;
    lastVisit: number;  // ms timestamp, 0 = never
    rps: { friend: number; bmo: number; ties: number };
    gameBest: number;   // Best score in the hidden-button game
    konami: boolean;    // Konami code found: unlocks Rainbow BMO
  };
  pendingSince: number;  // Index into history of the first message not yet summarised
  special: boolean;      // This is the special friend BMO was made for
  lastBathJoke: string;  // Date (YYYY-MM-DD) of the last "Finn's bath time" joke
}

// What gets sent to the backend with each chat (matches server limits)
export interface MemoryPayload extends Profile {
  notes: string[];
}

export const MEMORY_LIMITS = { name: 40, pronouns: 40, personality: 300, noteChars: 120, notes: 20 };
const MAX_HISTORY = 200;
const STORAGE_KEY = 'bmo-memory-v1';

export const emptyMemory = (): BMOMemory => ({
  profile: { name: '', pronouns: '', personality: '' },
  userEdited: { name: false, pronouns: false, personality: false },
  notes: [],
  history: [],
  stats: { visits: 0, lastVisit: 0, rps: { friend: 0, bmo: 0, ties: 0 }, gameBest: 0, konami: false },
  pendingSince: 0,
  special: false,
  lastBathJoke: ''
});

export const loadMemory = (): BMOMemory => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const saved = JSON.parse(raw) as Partial<BMOMemory>;
    const base = emptyMemory();
    // Merge over defaults so older/partial saves still load
    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...saved.profile },
      userEdited: { ...base.userEdited, ...saved.userEdited },
      stats: { ...base.stats, ...saved.stats, rps: { ...base.stats.rps, ...saved.stats?.rps } },
      notes: Array.isArray(saved.notes) ? saved.notes : [],
      history: Array.isArray(saved.history) ? saved.history : []
    };
  } catch {
    return emptyMemory();
  }
};

export const saveMemory = (memory: BMOMemory) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage full or blocked - BMO just won't remember this time
  }
};

export const clearMemory = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
};

// Keep history to the most recent messages, shifting the unsummarised pointer with it
export const trimHistory = (memory: BMOMemory): BMOMemory => {
  const overflow = memory.history.length - MAX_HISTORY;
  if (overflow <= 0) return memory;
  return {
    ...memory,
    history: memory.history.slice(overflow),
    pendingSince: Math.max(0, memory.pendingSince - overflow)
  };
};

export const toPayload = (memory: BMOMemory): MemoryPayload => ({
  name: memory.profile.name.slice(0, MEMORY_LIMITS.name),
  pronouns: memory.profile.pronouns.slice(0, MEMORY_LIMITS.pronouns),
  personality: memory.profile.personality.slice(0, MEMORY_LIMITS.personality),
  notes: memory.notes.slice(0, MEMORY_LIMITS.notes).map(n => n.slice(0, MEMORY_LIMITS.noteChars))
});

// Apply what the backend learned, keeping anything the friend edited themselves
export const mergeLearned = (memory: BMOMemory, learned: MemoryPayload, summarisedUpTo: number): BMOMemory => ({
  ...memory,
  profile: {
    name: memory.userEdited.name ? memory.profile.name : learned.name,
    pronouns: memory.userEdited.pronouns ? memory.profile.pronouns : learned.pronouns,
    personality: memory.userEdited.personality ? memory.profile.personality : learned.personality
  },
  notes: learned.notes,
  pendingSince: Math.max(memory.pendingSince, summarisedUpTo)
});
