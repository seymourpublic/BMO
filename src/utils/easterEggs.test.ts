import { describe, expect, it } from 'vitest';
import { asksForName, createKonamiTracker, detectPhrase, extractIntroName } from './easterEggs';

describe('detectPhrase', () => {
  it.each([
    ['CLICK IT CLICK IT!!', 'clickIt'],
    ['omg clock it', 'clockIt'],
    ['BMO chop!', 'chop'],
    ['can we play detective?', 'detective'],
    ['case closed', 'caseClosed'],
    ['can I talk to Football?', 'football'],
    ['bye football', 'footballBye'],
    ['sing that song I taught you', 'originalSong'],
    ['sing me a song', 'sing'],
  ])('"%s" → %s', (text, egg) => {
    expect(detectPhrase(text)).toBe(egg);
  });

  it.each(['I like singing', 'hello there', 'I clocked out early'])('ignores ordinary messages: "%s"', text => {
    expect(detectPhrase(text)).toBeNull();
  });
});

describe('extractIntroName', () => {
  it('finds names in introductions', () => {
    expect(extractIntroName("Hi, I'm Erica!", false)).toBe('Erica');
    expect(extractIntroName('my name is erica', false)).toBe('erica');
    expect(extractIntroName('call me Sam', false)).toBe('Sam');
  });

  it('accepts a single word only right after BMO asked for a name', () => {
    expect(extractIntroName('Erica', true)).toBe('Erica');
    expect(extractIntroName('Erica', false)).toBeNull();
  });

  it('does not mistake feelings for names', () => {
    expect(extractIntroName("I'm fine thanks", false)).toBeNull();
    expect(extractIntroName("i'm so tired", false)).toBeNull();
    expect(extractIntroName('Fine.', true)).toBeNull();
  });
});

describe('asksForName', () => {
  it('spots BMO asking for a name', () => {
    expect(asksForName('What is your name, friend?')).toBe(true);
    expect(asksForName('Do you want to play?')).toBe(false);
  });
});

describe('createKonamiTracker', () => {
  const code = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'green', 'red'];

  it('completes on the last press of the code', () => {
    const tracker = createKonamiTracker();
    const results = code.map(b => tracker.press(b));
    expect(results.at(-1)).toBe(true);
    expect(results.slice(0, -1).every(r => !r)).toBe(true);
  });

  it('allows extra "up"s at the start', () => {
    const tracker = createKonamiTracker();
    expect(['up', ...code].map(b => tracker.press(b)).includes(true)).toBe(true);
  });

  it('resets on a wrong press', () => {
    const tracker = createKonamiTracker();
    ['up', 'up', 'down', 'left'].forEach(b => tracker.press(b));
    expect(code.slice(3).map(b => tracker.press(b)).includes(true)).toBe(false);
  });

  it('only claims green/red when they are the next part of the code', () => {
    const tracker = createKonamiTracker();
    expect(tracker.expects('green')).toBe(false);
    code.slice(0, 8).forEach(b => tracker.press(b));
    expect(tracker.expects('green')).toBe(true);
    expect(tracker.expects('red')).toBe(false);
  });
});
