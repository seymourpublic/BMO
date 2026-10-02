// How BMO grows: features it "learns", milestones it celebrates, and getting better at games.
// Lines here are fixed (so the voice is cached) and generic: nothing personal belongs in this file.

// --- Features BMO grows into ---
// Add an entry whenever a new feature ships: BMO dreams about it on a wake,
// and gasps the first time the friend uses it.
export type FeatureId = 'talkMode' | 'camera' | 'memories' | 'smartRps' | 'kitchen' | 'study' | 'quiz' | 'teach' | 'fashion';

export interface Feature {
  id: FeatureId;
  dream: string;     // Said on waking, once, as a hint
  firstUse: string;  // Said the first time the friend uses it
}

export const FEATURES: Feature[] = [
  {
    id: 'talkMode',
    dream: "BMO had the strangest dream… we talked and talked and nobody had to press any buttons! Maybe the little speech bubble does something…",
    firstUse: "Whoa! BMO can keep listening now? BMO feels so grown up!"
  },
  {
    id: 'camera',
    dream: "BMO had the strangest dream… BMO's heart was a camera! Maybe if you press BMO's little blue dot…",
    firstUse: "Whoa! BMO didn't know it could do that! BMO IS camera!"
  },
  {
    id: 'memories',
    dream: "BMO dreamed it had a memory card full of happy pictures… Do you have any to show BMO? Look in Photos!",
    firstUse: 'BMO can keep memories now? BMO will treasure them forever and ever!'
  },
  {
    id: 'smartRps',
    dream: 'BMO practised Rock Paper Scissors in its dreams… all night long. Watch out, friend!',
    firstUse: 'BMO has been practising! Hehe. Get ready!'
  },
  {
    id: 'kitchen',
    dream: "BMO dreamed it was a tiny chef in a tall white hat, stirring a giant pot… If you ever say 'BMO, let's cook', BMO will help you!",
    firstUse: 'BMO gets to be your kitchen helper?! BMO has always wanted a chef hat!'
  },
  {
    id: 'study',
    dream: "BMO dreamed it was a quiet little library, where everyone studied together… If you ever say 'study time', BMO will be your focus buddy!",
    firstUse: 'BMO can be your study buddy? BMO will be the quietest buddy ever. Shhh!'
  },
  {
    id: 'quiz',
    dream: "BMO dreamed it was a game show host with a shiny microphone… Say 'quiz me' and show BMO your notes!",
    firstUse: 'BMO gets to be a quiz show host?! Welcome to the BMO Quiz Show!'
  },
  {
    id: 'teach',
    dream: "BMO dreamed it went to school and the teacher was YOU… Say 'let me teach you' and BMO will listen really hard!",
    firstUse: 'You are going to teach BMO? BMO loves school! BMO is all ears!'
  },
  {
    id: 'fashion',
    dream: "BMO dreamed it walked down a runway in a tiny top hat, and everyone cheered… Say 'fashion show' and BMO will be your host!",
    firstUse: 'A fashion show?! BMO has been practising its runway walk! Strike a pose!'
  }
];

export const ALL_FEATURE_IDS = FEATURES.map(f => f.id);

export interface FeatureProgress {
  dreamed: string[];
  used: string[];
}

// The next feature BMO hasn't dreamed about or seen used yet (one per wake)
export const nextDream = (progress: FeatureProgress): Feature | null =>
  FEATURES.find(f => !progress.dreamed.includes(f.id) && !progress.used.includes(f.id)) ?? null;

export const featureById = (id: FeatureId): Feature => FEATURES.find(f => f.id === id)!;

// --- Milestones ---
export type MilestoneId =
  | 'chats-50' | 'chats-100' | 'chats-250' | 'chats-500' | 'chats-1000'
  | 'days-7' | 'days-30' | 'days-100' | 'days-365'
  | 'first-photo' | 'first-memory' | 'first-dish';

const CHAT_MILESTONES: Array<[number, MilestoneId]> = [[50, 'chats-50'], [100, 'chats-100'], [250, 'chats-250'], [500, 'chats-500'], [1000, 'chats-1000']];
const DAY_MILESTONES: Array<[number, MilestoneId]> = [[7, 'days-7'], [30, 'days-30'], [100, 'days-100'], [365, 'days-365']];
const DAY_MS = 86_400_000;

// Milestones big enough for BMO to sing as well
export const SONG_MILESTONES: MilestoneId[] = ['days-100', 'days-365'];
export const MILESTONE_FALLBACK = "BMO is so happy we're friends!";

export interface MilestoneStats {
  chats: number;
  firstVisit: number;  // ms; 0 = unknown
  photos: number;
  memories: number;
  dishes?: number;     // Dishes cooked with BMO in kitchen mode
}

// The highest milestone reached in a list that hasn't been celebrated yet
const highestReached = (list: Array<[number, MilestoneId]>, value: number, seen: string[]): MilestoneId | null => {
  const reached = list.filter(([at]) => value >= at);
  const top = reached[reached.length - 1];
  return top && !seen.includes(top[1]) ? top[1] : null;
};

// Which milestone (if any) to celebrate now. Firsts come first, then time together, then chats.
export const dueMilestone = (stats: MilestoneStats, seen: string[], now = Date.now()): MilestoneId | null => {
  if (stats.photos >= 1 && !seen.includes('first-photo')) return 'first-photo';
  if (stats.memories >= 1 && !seen.includes('first-memory')) return 'first-memory';
  if ((stats.dishes ?? 0) >= 1 && !seen.includes('first-dish')) return 'first-dish';
  if (stats.firstVisit > 0) {
    const days = highestReached(DAY_MILESTONES, (now - stats.firstVisit) / DAY_MS, seen);
    if (days) return days;
  }
  return highestReached(CHAT_MILESTONES, stats.chats, seen);
};

// Celebrating a milestone also covers smaller ones of the same kind (no 50-chat party after the 100th)
export const milestonesCoveredBy = (id: MilestoneId): MilestoneId[] => {
  const list = id.startsWith('chats-') ? CHAT_MILESTONES : id.startsWith('days-') ? DAY_MILESTONES : null;
  if (!list) return [id];
  const index = list.findIndex(([, m]) => m === id);
  return list.slice(0, index + 1).map(([, m]) => m);
};

// --- Rock Paper Scissors: BMO learns the friend's habits ---
export type Hand = 'rock' | 'paper' | 'scissors';
export const HANDS: Hand[] = ['rock', 'paper', 'scissors'];
const COUNTER: Record<Hand, Hand> = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

export const MAX_RPS_THROWS = 30;
const LEARNING_STARTS_AFTER = 5;  // Games of pure luck before BMO starts using what it learned
const START_SMART = 0.10;
const MAX_SMART = 0.45;           // Never unbeatable

// How often BMO plays its prediction, growing with every game played
export const smartChance = (gamesPlayed: number): number =>
  gamesPlayed < LEARNING_STARTS_AFTER ? 0 : Math.min(MAX_SMART, START_SMART + 0.01 * (gamesPlayed - LEARNING_STARTS_AFTER));

const mostCommon = (hands: Hand[]): Hand | null => {
  if (!hands.length) return null;
  const counts = HANDS.map(h => hands.filter(x => x === h).length);
  return HANDS[counts.indexOf(Math.max(...counts))];
};

// What the friend will probably throw next: what usually follows their last throw, else their favourite
export const predictThrow = (throws: Hand[]): Hand | null => {
  if (throws.length < 3) return null;
  const last = throws[throws.length - 1];
  const followers = throws.slice(1).filter((_, i) => throws[i] === last);
  return mostCommon(followers) ?? mostCommon(throws);
};

// BMO's hand for this round. `smart` says whether it came from a prediction.
export const pickBmoHand = (throws: Hand[], gamesPlayed: number, rand: () => number = Math.random): { hand: Hand; smart: boolean } => {
  const predicted = predictThrow(throws);
  if (predicted && rand() < smartChance(gamesPlayed)) return { hand: COUNTER[predicted], smart: true };
  return { hand: HANDS[Math.floor(rand() * HANDS.length)], smart: false };
};

// Sometimes BMO says out loud that it worked the friend out
export const PREDICTION_LINE_CHANCE = 0.25;
export const predictionLine = (friendHand: Hand): string => `Hmm… BMO thinks you really like ${friendHand}!`;
