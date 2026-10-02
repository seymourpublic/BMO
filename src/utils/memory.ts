// BMO's memory of the friend it talks to. Stored only on this device.
import { FeatureProgress, Hand, MAX_RPS_THROWS } from './growth';

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

// Something from the friend's life to ask about later ("Did the dumplings work?")
export interface FollowUp {
  about: string;
  askAfter: string;  // YYYY-MM-DD (friend's local date)
}

// A word or phrase the friend uses that BMO has picked up
export interface Word {
  word: string;
  meaning?: string;
}

// BMO's private diary: never shown, only mentioned
export interface DiaryDay {
  date: string;      // YYYY-MM-DD
  lines: string[];
}

// What a memory update learned besides the profile and notes
export interface Growth {
  followUps: FollowUp[];
  words: Word[];
  diary: string;     // One new line for today, or ''
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
    chats: number;      // Messages the friend has sent
    firstVisit: number; // ms timestamp of the first visit on this device (0 = unknown)
    rpsThrows: Hand[];  // The friend's recent Rock Paper Scissors throws (BMO learns from them)
    photos: number;     // Photos taken with BMO's camera
    memories: number;   // Memory photos the friend added
    dishes: number;     // Dishes cooked together in kitchen mode
  };
  followUps: FollowUp[];
  words: Word[];
  diary: DiaryDay[];
  features: FeatureProgress;   // Features BMO has dreamed about / seen used
  milestonesSeen: string[];
  pendingSince: number;  // Index into history of the first message not yet summarised
  special: boolean;      // This is the special friend BMO was made for
  lastBathJoke: string;  // Date (YYYY-MM-DD) of the last "Finn's bath time" joke
  occasionsSeen: Record<string, number>;  // Special day id -> year its message was last shown
}

// What gets sent to the backend with each chat (matches server limits)
export interface MemoryPayload extends Profile {
  notes: string[];
  words?: Word[];
  diary?: string[];   // BMO's most recent diary lines (background only)
}

export const MEMORY_LIMITS = { name: 40, pronouns: 40, personality: 300, noteChars: 120, notes: 20 };
export const GROWTH_LIMITS = {
  followUps: 10, followUpChars: 120, followUpExpiryDays: 14,
  words: 15, wordChars: 40, meaningChars: 80,
  diaryLinesPerDay: 3, diaryChars: 160, diaryDays: 60, diaryInChat: 3
};
const MAX_HISTORY = 200;
const STORAGE_KEY = 'bmo-memory-v1';

export const emptyMemory = (): BMOMemory => ({
  profile: { name: '', pronouns: '', personality: '' },
  userEdited: { name: false, pronouns: false, personality: false },
  notes: [],
  history: [],
  stats: {
    visits: 0, lastVisit: 0, rps: { friend: 0, bmo: 0, ties: 0 }, gameBest: 0, konami: false,
    chats: 0, firstVisit: 0, rpsThrows: [], photos: 0, memories: 0, dishes: 0
  },
  followUps: [],
  words: [],
  diary: [],
  features: { dreamed: [], used: [] },
  milestonesSeen: [],
  pendingSince: 0,
  special: false,
  lastBathJoke: '',
  occasionsSeen: {}
});

export const loadMemory = (): BMOMemory => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const saved = JSON.parse(raw) as Partial<BMOMemory>;
    const base = emptyMemory();
    const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);
    const history = list<HistoryMessage>(saved.history);
    // Merge over defaults so older/partial saves still load
    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...saved.profile },
      userEdited: { ...base.userEdited, ...saved.userEdited },
      stats: {
        ...base.stats,
        ...saved.stats,
        rps: { ...base.stats.rps, ...saved.stats?.rps },
        rpsThrows: list<Hand>(saved.stats?.rpsThrows),
        // Saves from before chats were counted: count the friend's messages still in the history
        chats: typeof saved.stats?.chats === 'number' ? saved.stats.chats : history.filter(m => m.role === 'user').length
      },
      notes: list<string>(saved.notes),
      history,
      followUps: list<FollowUp>(saved.followUps),
      words: list<Word>(saved.words),
      diary: list<DiaryDay>(saved.diary),
      features: { dreamed: list<string>(saved.features?.dreamed), used: list<string>(saved.features?.used) },
      milestonesSeen: list<string>(saved.milestonesSeen)
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
  notes: memory.notes.slice(0, MEMORY_LIMITS.notes).map(n => n.slice(0, MEMORY_LIMITS.noteChars)),
  words: memory.words.slice(-GROWTH_LIMITS.words),
  diary: memory.diary.flatMap(day => day.lines).slice(-GROWTH_LIMITS.diaryInChat)
});

// --- Growing ---

// The friend's local date as YYYY-MM-DD
export const localDate = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
};

// The follow-up to ask about today (if any): due, and not too old to still make sense
export const dueFollowUp = (followUps: FollowUp[], today: string): FollowUp | null =>
  followUps.find(f => f.askAfter <= today && today <= addDays(f.askAfter, GROWTH_LIMITS.followUpExpiryDays)) ?? null;

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Add what a memory update learned: new follow-ups and words, and a line in today's diary
export const mergeGrowth = (memory: BMOMemory, growth: Growth, today: string): BMOMemory => {
  const followUps = [
    ...memory.followUps.filter(f => !growth.followUps.some(n => sameText(n.about, f.about))),
    ...growth.followUps
  ]
    .filter(f => today <= addDays(f.askAfter, GROWTH_LIMITS.followUpExpiryDays))  // Drop ones too old to ask
    .slice(-GROWTH_LIMITS.followUps);

  const words = [
    ...memory.words.filter(w => !growth.words.some(n => sameText(n.word, w.word))),
    ...growth.words
  ].slice(-GROWTH_LIMITS.words);

  let diary = memory.diary;
  const line = growth.diary.trim().slice(0, GROWTH_LIMITS.diaryChars);
  if (line) {
    const todays = diary.find(day => day.date === today);
    if (!todays) diary = [...diary, { date: today, lines: [line] }];
    else if (todays.lines.length < GROWTH_LIMITS.diaryLinesPerDay) {
      diary = diary.map(day => (day === todays ? { ...day, lines: [...day.lines, line] } : day));
    }
  }
  const oldest = addDays(today, -GROWTH_LIMITS.diaryDays);
  diary = diary.filter(day => day.date > oldest);

  return { ...memory, followUps, words, diary };
};

// Remember one of the friend's Rock Paper Scissors throws
export const addThrow = (throws: Hand[], hand: Hand): Hand[] => [...throws, hand].slice(-MAX_RPS_THROWS);

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
