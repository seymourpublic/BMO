import { describe, expect, it } from 'vitest';
import { NUDGE_RULES, canNudge, formatNow, isEcho, isGoodbye, wordCount } from './conversation';

describe('isEcho', () => {
  const bmo = 'BMO loves playing video games with Finn and Jake in the Tree Fort!';

  it('recognises BMO hearing its own voice', () => {
    expect(isEcho('video games with Finn and Jake', bmo)).toBe(true);
    expect(isEcho('loves playing video games', bmo)).toBe(true);
  });

  it('lets the friend talk over BMO', () => {
    expect(isEcho('wait BMO what time is it', bmo)).toBe(false);
    expect(isEcho('stop stop I need to tell you something', bmo)).toBe(false);
  });

  it('treats nothing heard as echo (nothing to act on)', () => {
    expect(isEcho('', bmo)).toBe(true);
  });
});

describe('wordCount', () => {
  it('counts words ignoring punctuation', () => {
    expect(wordCount('Hey, BMO!')).toBe(2);
    expect(wordCount('  ')).toBe(0);
  });
});

describe('canNudge', () => {
  const ready = { quietForMs: NUDGE_RULES.quietMs, sinceLastNudgeMs: NUDGE_RULES.minGapMs, unanswered: 0 };

  it('nudges when every rule allows it and the dice say yes', () => {
    expect(canNudge(ready, 0.1)).toBe(true);
  });

  it('only nudges sometimes', () => {
    expect(canNudge(ready, 0.9)).toBe(false);
  });

  it('waits for the friend to be quiet for a while', () => {
    expect(canNudge({ ...ready, quietForMs: 30_000 }, 0.1)).toBe(false);
  });

  it('leaves time between nudges', () => {
    expect(canNudge({ ...ready, sinceLastNudgeMs: 60_000 }, 0.1)).toBe(false);
  });

  it('stops after unanswered nudges so it never nags', () => {
    expect(canNudge({ ...ready, unanswered: NUDGE_RULES.maxUnanswered }, 0.1)).toBe(false);
  });
});

describe('formatNow', () => {
  it('describes the day and time in words', () => {
    const text = formatNow(new Date(2026, 9, 1, 14, 5));
    expect(text).toContain('Thursday');
    expect(text).toContain('October');
    expect(text).toContain('2026');
    expect(text).toMatch(/2:05\s?pm/i);
    expect(text.length).toBeLessThanOrEqual(60);
  });
});

describe('isGoodbye', () => {
  it.each(['bye BMO', 'Goodnight, BMO!', 'ok stop listening', "that's all"])('ends the conversation on "%s"', text => {
    expect(isGoodbye(text)).toBe(true);
  });

  it('does not end it on ordinary messages', () => {
    expect(isGoodbye('I said bye to my friend today')).toBe(false);
  });
});
