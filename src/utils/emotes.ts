import { Mood } from '../types';

const EMOTE_REGEX = /\*([^*]+)\*/g;

// Split a reply into its *emotes* and the text BMO should say out loud
export const extractEmotes = (text: string): { cleanText: string; emotes: string[] } => {
  const emotes = Array.from(text.matchAll(EMOTE_REGEX), m => m[1].toLowerCase().trim());
  const cleanText = text.replace(EMOTE_REGEX, ' ').replace(/\s+/g, ' ').trim();
  return { cleanText, emotes };
};

const EMOTE_MOODS: Array<[Mood, string[]]> = [
  // Stronger feelings first, so "cries" isn't just "sad" and "sparkles" isn't just "excited"
  ['love',      ['heart', 'love', 'adore']],
  ['crying',    ['cries', 'crying', 'sob', 'weep']],
  ['sleepy',    ['yawn', 'sleepy', 'drowsy']],
  ['starry',    ['sparkle', 'star']],
  ['blushing',  ['blush', 'shy']],
  ['pouty',     ['pout', 'grump', 'hmph', 'huff']],
  ['excited',   ['excit', 'jump', 'bounce', 'yay', 'cheer', 'wiggl', 'spin']],
  ['happy',     ['smile', 'grin', 'giggle', 'laugh', 'happ']],  // 'happ' also matches "happily"
  ['surprised', ['gasp', 'wow', 'surpris', 'shock', 'amaz']],
  ['sad',       ['sad', 'cry', 'tear', 'frown', 'sigh', 'sniff']],
  ['thinking',  ['think', 'ponder', 'hmm', 'wonder']],
  ['confused',  ['confus', 'puzzle', 'scratch']],
  ['excited',   ['screen', 'light', 'glow', 'blink']],  // Screen emotes flash excitedly
];

// Map an emote like "giggles" or "screen flickers" to one of BMO's moods
export const emoteToMood = (emote: string): Mood => {
  for (const [mood, keywords] of EMOTE_MOODS) {
    if (keywords.some(k => emote.includes(k))) return mood;
  }
  return 'happy';
};
