// Turns streamed reply text into speakable sentences as soon as each one is complete.
// *Emotes* are pulled out and reported when they close; they're never spoken.

interface SplitterOptions {
  onSentence: (sentence: string) => void;
  onEmote?: (emote: string) => void;
}

// Sentences shorter than this are joined with the next one ("Oh!" + "BMO loves that!")
const MIN_SENTENCE_CHARS = 25;
// Words ending in "." that don't end a sentence
const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc)\.$/i;
// Sentence end: . ! ? … (possibly repeated, possibly closing quote/bracket) followed by whitespace
const SENTENCE_END = /[.!?…]+["')\]]*\s/g;

export const createSentenceSplitter = ({ onSentence, onEmote }: SplitterOptions) => {
  let raw = '';       // Unprocessed text (may end mid-emote or mid-sentence)
  let spoken = '';    // Clean text waiting to become a sentence
  let pending = '';   // A short sentence waiting to be joined with the next

  const emit = (sentence: string, force = false) => {
    const text = `${pending} ${sentence}`.replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (text.length < MIN_SENTENCE_CHARS && !force) {
      pending = text;
      return;
    }
    pending = '';
    onSentence(text);
  };

  // Move text out of `raw`: strip complete emotes, keep an unfinished one for later
  const takeCleanText = (final: boolean) => {
    let out = '';
    for (;;) {
      const open = raw.indexOf('*');
      if (open === -1) {
        out += raw;
        raw = '';
        break;
      }
      const close = raw.indexOf('*', open + 1);
      if (close === -1) {
        out += raw.slice(0, open);
        // An emote that never closes at the end is just dropped
        raw = final ? '' : raw.slice(open);
        break;
      }
      out += raw.slice(0, open) + ' ';
      const emote = raw.slice(open + 1, close).trim().toLowerCase();
      if (emote) onEmote?.(emote);
      raw = raw.slice(close + 1);
    }
    return out;
  };

  const flushSentences = () => {
    SENTENCE_END.lastIndex = 0;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_END.exec(spoken)) !== null) {
      const end = match.index + match[0].length;
      const candidate = spoken.slice(start, end).trim();
      if (ABBREVIATIONS.test(candidate)) continue;  // "Mr. Pig" isn't the end of a sentence
      emit(candidate);
      start = end;
    }
    spoken = spoken.slice(start);
  };

  return {
    // Add the next piece of streamed text
    push(delta: string) {
      raw += delta;
      spoken += takeCleanText(false);
      flushSentences();
    },
    // The reply is finished: speak whatever is left
    end() {
      spoken += takeCleanText(true);
      flushSentences();
      emit(spoken, true);
      spoken = '';
    }
  };
};

// Reply text with *emotes* removed, for the on-screen caption while streaming
export const captionText = (text: string): string =>
  text.replace(/\*[^*]*\*/g, ' ').replace(/\*[^*]*$/, '').replace(/\s+/g, ' ').trim();
