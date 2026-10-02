// Understanding what the friend says in the kitchen, on the device (fast, works with messy hands).
// Anything not recognised here goes to BMO as a normal question.

export type KitchenCommand = 'next' | 'back' | 'repeat' | 'ingredients' | 'stepsLeft' | 'done' | 'stop';

// Short commands only: a long sentence that happens to contain "next" is a question for BMO
const MAX_COMMAND_WORDS = 7;

const COMMANDS: Array<[KitchenCommand, RegExp]> = [
  ['stop', /\b(stop|quit|end|cancel) (cooking|the recipe|kitchen( mode)?)\b|\bleave (the )?kitchen\b/i],
  ['done', /\b(i'?m|we'?re|i am|we are|all) (done|finished)\b|\bit'?s (done|ready|finished)\b|^(done|finished)$/i],
  ['stepsLeft', /\bhow many (more )?steps\b|\bsteps (are )?left\b|\bhow (much|long) (more|left)\b/i],
  ['ingredients', /\b(what|which) (do i|ingredients do i) need\b|\bingredients?\b|\bwhat goes in\b/i],
  ['repeat', /\b(repeat|again|say (that|it) again|what was (that|the step)|pardon|come again)\b/i],
  ['back', /\b(go )?back\b|\bprevious( step)?\b|\bstep before\b|\blast step\b/i],
  ['next', /\bnext\b|\bcontinue\b|\bdone with (that|this)( step)?\b|\bwhat'?s next\b|\b(ok(ay)?|got it|ready),? (next|go on)\b|^(ok(ay)?|got it|go on)$/i],
];

const normalise = (text: string) => text.trim().replace(/^(hey |hi |ok |okay )?bmo[,!.]?\s*/i, '').replace(/[.!?]+$/, '').trim();

export const parseKitchenCommand = (text: string): KitchenCommand | null => {
  const said = normalise(text);
  if (!said || said.split(/\s+/).length > MAX_COMMAND_WORDS) return null;
  return COMMANDS.find(([, pattern]) => pattern.test(said))?.[0] ?? null;
};

// "Let's start", "ready", "go" on the ingredients screen
export const isStartCooking = (text: string): boolean =>
  /\b(start|let'?s go|let'?s cook|ready|begin|go|next|i have (everything|it all))\b/i.test(normalise(text));

// "I don't have coriander and lemons" → ['coriander', 'lemons']
export const parseMissing = (text: string): string[] => {
  const match = /\b(?:i )?(?:don'?t|do not|didn'?t) have (?:any )?(.+)|\b(?:i'?m |i am )?(?:out of|missing|need to buy) (?:some )?(.+)/i.exec(normalise(text));
  const list = match?.[1] ?? match?.[2];
  if (!list) return [];
  return list.split(/,|\band\b|\bor\b/i).map(s => s.trim().replace(/^(any|some|the) /i, '')).filter(Boolean);
};

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

// "Four hearts!", "a 5", "it was 3" → 1–5, or null
export const parseRating = (text: string): number | null => {
  const said = normalise(text).toLowerCase();
  const digit = /\b([1-5])\b/.exec(said)?.[1];
  if (digit) return Number(digit);
  const word = Object.keys(NUMBER_WORDS).find(w => new RegExp(`\\b${w}\\b`).test(said));
  return word ? NUMBER_WORDS[word] : null;
};

// "No", "nothing", "it was perfect" when asked what to change next time
export const isNothingToChange = (text: string): boolean =>
  /^(no|nope|nah|nothing|none|no changes?)\b|\b(perfect|just right|nothing to change|wouldn'?t change)\b/i.test(normalise(text));

// "Something else" / "another one" when BMO suggested a recipe
export const wantsSomethingElse = (text: string): boolean =>
  /\b(something else|another (one|recipe|idea)|different (one|recipe)|not that)\b/i.test(normalise(text));

// Does a needed item match an ingredient line? ("coriander" ↔ "1 handful fresh coriander")
// Spelling differences are forgiven: doubled letters count once ("chilli" ↔ "chili") and plurals match singulars
const simplify = (text: string) => text.toLowerCase().replace(/(.)\1+/g, '$1');
export const matchesIngredient = (wanted: string, ingredient: string): boolean => {
  const word = simplify(wanted).replace(/(es|s)$/, '');
  return word.length >= 3 && simplify(ingredient).includes(word);
};
