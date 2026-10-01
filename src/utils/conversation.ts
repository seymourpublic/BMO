// Helpers for natural conversation: talking over BMO, BMO speaking first, and the date.

const words = (text: string): string[] =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);

// Share of the heard words that BMO is saying itself, above which it's BMO's own voice
const ECHO_THRESHOLD = 0.6;

// Did the microphone just hear BMO's own voice (rather than the friend talking over it)?
export const isEcho = (heard: string, bmoIsSaying: string): boolean => {
  const heardWords = words(heard);
  if (heardWords.length === 0) return true;
  const bmoWords = new Set(words(bmoIsSaying));
  const matching = heardWords.filter(w => bmoWords.has(w)).length;
  return matching / heardWords.length >= ECHO_THRESHOLD;
};

// Real interruptions need at least this many words (one word is often a cough or noise)
export const INTERRUPT_MIN_WORDS = 2;
export const wordCount = (text: string) => words(text).length;

// --- BMO speaking first ---
export const NUDGE_RULES = {
  quietMs: 60_000,            // Friend has been quiet at least this long
  minGapMs: 5 * 60_000,       // At most one nudge per 5 minutes
  maxUnanswered: 2,           // Stop after this many nudges with no answer
  chance: 0.5                 // Even then, only sometimes
};

export const canNudge = (
  state: { quietForMs: number; sinceLastNudgeMs: number; unanswered: number },
  roll: number = Math.random()
): boolean =>
  state.quietForMs >= NUDGE_RULES.quietMs &&
  state.sinceLastNudgeMs >= NUDGE_RULES.minGapMs &&
  state.unanswered < NUDGE_RULES.maxUnanswered &&
  roll < NUDGE_RULES.chance;

// "Thursday 1 October 2026, 2:05 pm" in the friend's own time zone
export const formatNow = (date: Date = new Date()): string => {
  const day = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}, ${time}`.replace(/\s+/g, ' ').slice(0, 60);
};

// Phrases that end conversation mode
export const isGoodbye = (text: string): boolean =>
  /\b(bye|goodbye|good night|goodnight),? bmo\b|\bstop listening\b|\bthat'?s all\b/i.test(text);
