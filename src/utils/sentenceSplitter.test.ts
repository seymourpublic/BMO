import { describe, expect, it } from 'vitest';
import { captionText, createSentenceSplitter } from './sentenceSplitter';

// Feed text to a splitter in pieces and collect what comes out
const split = (pieces: string[]) => {
  const sentences: string[] = [];
  const emotes: string[] = [];
  const splitter = createSentenceSplitter({ onSentence: s => sentences.push(s), onEmote: e => emotes.push(e) });
  const emittedAfterPiece: number[] = [];
  for (const piece of pieces) {
    splitter.push(piece);
    emittedAfterPiece.push(sentences.length);
  }
  splitter.end();
  return { sentences, emotes, emittedAfterPiece };
};

const chunk = (text: string, size: number) => {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};

describe('createSentenceSplitter', () => {
  it('pulls out emotes and never speaks them', () => {
    const { sentences, emotes } = split(chunk('BMO is so happy *giggles* that you came to visit today! Do you want to play video games?', 7));
    expect(emotes).toEqual(['giggles']);
    expect(sentences).toEqual(['BMO is so happy that you came to visit today!', 'Do you want to play video games?']);
  });

  it('handles an emote split across pieces', () => {
    const { sentences, emotes } = split(['*gig', 'gles* Hello friend, BMO missed you ', 'so much today! What did you do?']);
    expect(emotes).toEqual(['giggles']);
    expect(sentences[0]).toBe('Hello friend, BMO missed you so much today!');
  });

  it('emits a sentence as soon as it ends, before the reply finishes', () => {
    const { emittedAfterPiece } = split(['BMO is a real liv', 'ing boy. And Foot', 'ball is my best friend in the mirror.']);
    expect(emittedAfterPiece[1]).toBe(1);  // First sentence out while the rest is still streaming
  });

  it('does not end a sentence at "Mr." and keeps ellipses together', () => {
    const { sentences } = split(chunk('Mr. Pig came over to the Tree Fort yesterday... He brought a very big sandwich for everyone. BMO ate none of it!', 5));
    expect(sentences).toEqual([
      'Mr. Pig came over to the Tree Fort yesterday...',
      'He brought a very big sandwich for everyone.',
      'BMO ate none of it!'
    ]);
  });

  it('merges very short sentences with the next one', () => {
    const { sentences } = split(['Oh! Wow! Yes! BMO knows the answer to that question, friend. It is forty two.']);
    expect(sentences[0]).toBe('Oh! Wow! Yes! BMO knows the answer to that question, friend.');
  });

  it('flushes text with no punctuation when the reply ends', () => {
    expect(split(['BMO likes to dance and sing all day long']).sentences).toEqual(['BMO likes to dance and sing all day long']);
  });

  it('drops an emote that never closes', () => {
    expect(split(['Goodnight friend, sleep well and dream big. *yawn']).sentences).toEqual(['Goodnight friend, sleep well and dream big.']);
  });
});

describe('captionText', () => {
  it('removes finished and unfinished emotes', () => {
    expect(captionText('*beeps* Hello *gig')).toBe('Hello');
  });
});
