// Easter-egg triggers: phrases the friend says, button sequences, and introductions.
import { SPECIAL_SONG_TRIGGERS } from './songs';

export type PhraseEgg =
  | 'clickIt' | 'clockIt' | 'chop'
  | 'detective' | 'caseClosed'
  | 'football' | 'footballBye'
  | 'originalSong' | 'sing' | 'camera'
  | 'cook' | 'recipeBook' | 'shoppingList'
  | 'study' | 'quiz' | 'hardOnes' | 'studyCards' | 'teach'
  | 'fashionShow' | 'outfitCheck' | 'wardrobe';

const PHRASES: Array<[PhraseEgg, RegExp]> = [
  ['originalSong', new RegExp(SPECIAL_SONG_TRIGGERS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')],
  ['wardrobe', /\b(bmo'?s|your) wardrobe\b|\bdress (up )?bmo\b|\bbmo,? dress up\b/i],
  ['fashionShow', /\bfashion show\b|\brunway\b|\bcatwalk\b/i],
  ['outfitCheck', /\bhow do i look\b|\boutfit check\b|\bdo i look (ok|okay|good|nice)\b|\brate my (outfit|look)\b/i],
  ['hardOnes', /\bquiz (me on )?my (hard|tricky) (ones|questions|cards)\b|\bmy (hard|tricky) ones\b|\breview my (study )?cards\b/i],
  ['studyCards', /\bstudy cards\b|\bshow (me )?my cards\b/i],
  ['quiz', /\bquiz me\b|\bmake (me )?a quiz\b|\btest me on\b/i],
  ['teach', /\blet me teach you\b|\bteach bmo\b|\bi('ll| will) teach you\b|\bcan i teach you\b|\bwant to learn about\b/i],
  ['study', /\bstudy time\b|\bfocus (mode|time)\b|\bhelp me (study|focus)\b|\btime to study\b|\bpomodoro\b|\blet'?s study\b/i],
  ['recipeBook', /\brecipe book\b|\b(show|open) (me )?my recipes\b/i],
  ['shoppingList', /\bshopping list\b/i],
  ['cook', /\blet'?s (cook|bake)\b|\bhelp me (cook|bake)\b|\bcooking time\b|\bkitchen mode\b|\bwhat (can|should) i (make|cook)\b|\bteach me (to|how to) cook\b/i],
  ['camera', /\btake (a|my|our|a cute) (picture|photo|pic|selfie)\b|\bbmo is camera\b|\bselfie\b/i],
  ['clickIt', /\bclick it\b/i],
  ['clockIt', /\bclock it\b/i],
  ['chop', /\bbmo chop\b|\bkarate\b/i],
  ['caseClosed', /\bcase closed\b/i],
  ['detective', /\bdetective\b|\bbmo noire\b|\bsolve a (case|mystery)\b/i],
  ['footballBye', /\b(bye|goodbye),? football\b|\bbring (back )?bmo( back)?\b|\bwhere('s| is) bmo\b/i],
  ['football', /\b(talk|speak) to football\b|\bwhere('s| is) football\b|\bi want football\b|\bcan i (see|meet) football\b|\bhi,? football\b/i],
  ['sing', /\bsing\b|\ba song\b/i],
];

// Which easter egg (if any) a message triggers. Order matters: more specific first.
export const detectPhrase = (text: string): PhraseEgg | null =>
  PHRASES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;

const NOT_NAMES = new Set([
  'fine', 'good', 'okay', 'ok', 'here', 'back', 'bored', 'sad', 'happy', 'tired', 'hungry', 'sorry',
  'not', 'just', 'so', 'very', 'really', 'going', 'doing', 'feeling', 'a', 'an', 'the', 'me', 'you', 'bmo'
]);

// If a message looks like the friend saying their name, return the name.
// `justAskedName` = BMO's last line asked for their name, so a single word counts.
export const extractIntroName = (text: string, justAskedName: boolean): string | null => {
  const match = text.match(/\b(?:i'?m|i am|my name is|my name's|call me|this is|it'?s)\s+([a-z][a-z'-]{1,30})\b/i);
  const candidate = match?.[1] ?? (justAskedName ? text.trim().match(/^([a-z][a-z'-]{1,30})[.!]*$/i)?.[1] : undefined);
  if (!candidate || NOT_NAMES.has(candidate.toLowerCase())) return null;
  return candidate;
};

export const asksForName = (text: string): boolean => /\bwhat('s| is) your name\b|\byour name\b/i.test(text);

// ↑ ↑ ↓ ↓ ← → ← → then green, then red
const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'green', 'red'];

// Tracks button presses; `press` returns true when the code has just been completed
export const createKonamiTracker = () => {
  let progress = 0;
  return {
    press(button: string): boolean {
      if (button === KONAMI[progress]) {
        progress++;
      } else if (button === 'up') {
        // Extra "up"s at the start still count ("↑ ↑ ↑ ↓ ↓ ...")
        progress = progress === 2 ? 2 : 1;
      } else {
        progress = 0;
      }
      if (progress === KONAMI.length) {
        progress = 0;
        return true;
      }
      return false;
    },
    // Is this green/red press part of the code? (Then it shouldn't do its normal job.)
    expects(button: string): boolean {
      return progress >= 8 && KONAMI[progress] === button;
    }
  };
};
