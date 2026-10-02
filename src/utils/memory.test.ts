import { describe, expect, it, vi } from 'vitest';
import { BMOMemory, GROWTH_LIMITS, addDays, addThrow, dueFollowUp, emptyMemory, loadMemory, mergeGrowth, mergeLearned, toPayload, trimHistory, MEMORY_LIMITS } from './memory';
import { emoteToMood } from './emotes';
import { trimToSentence } from './api';

const withHistory = (count: number, pendingSince: number): BMOMemory => ({
  ...emptyMemory(),
  history: Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `message ${i}` })),
  pendingSince
});

describe('mergeLearned', () => {
  it('takes what BMO learned for fields the friend has not edited', () => {
    const merged = mergeLearned(emptyMemory(), { name: 'Sam', pronouns: 'he/him', personality: 'funny', notes: ['Likes cats'] }, 4);
    expect(merged.profile).toEqual({ name: 'Sam', pronouns: 'he/him', personality: 'funny' });
    expect(merged.notes).toEqual(['Likes cats']);
    expect(merged.pendingSince).toBe(4);
  });

  it('never overwrites fields the friend edited', () => {
    const memory: BMOMemory = {
      ...emptyMemory(),
      profile: { name: 'Nala', pronouns: '', personality: '' },
      userEdited: { name: true, pronouns: false, personality: false }
    };
    const merged = mergeLearned(memory, { name: 'Naledi', pronouns: 'she/her', personality: 'kind', notes: [] }, 2);
    expect(merged.profile.name).toBe('Nala');
    expect(merged.profile.pronouns).toBe('she/her');
  });
});

describe('trimHistory', () => {
  it('keeps the last 200 messages and shifts the unsummarised pointer', () => {
    const trimmed = trimHistory(withHistory(210, 205));
    expect(trimmed.history).toHaveLength(200);
    expect(trimmed.history[0].text).toBe('message 10');
    expect(trimmed.pendingSince).toBe(195);
  });

  it('leaves short histories alone', () => {
    const memory = withHistory(5, 2);
    expect(trimHistory(memory)).toBe(memory);
  });
});

describe('toPayload', () => {
  it('stays within the server limits', () => {
    const memory: BMOMemory = {
      ...emptyMemory(),
      profile: { name: 'x'.repeat(100), pronouns: '', personality: 'y'.repeat(500) },
      notes: Array.from({ length: 30 }, () => 'z'.repeat(200))
    };
    const payload = toPayload(memory);
    expect(payload.name).toHaveLength(MEMORY_LIMITS.name);
    expect(payload.personality).toHaveLength(MEMORY_LIMITS.personality);
    expect(payload.notes).toHaveLength(MEMORY_LIMITS.notes);
    expect(payload.notes[0]).toHaveLength(MEMORY_LIMITS.noteChars);
  });
});

describe('emoteToMood', () => {
  it.each([
    ['giggles', 'happy'],
    ['gasps', 'surprised'],
    ['sniffles', 'sad'],
    ['sighs sadly', 'sad'],
    ['wiggles', 'excited'],
    ['thinks', 'thinking'],
    ['screen flickers happily', 'happy'],
    ['something unknown', 'happy'],
    ['hearts', 'love'],
    ['cries', 'crying'],
    ['yawns', 'sleepy'],
    ['sparkles', 'starry'],
    ['blushes', 'blushing'],
    ['pouts', 'pouty'],
    ['gasps in amazement', 'surprised'],
  ])('"%s" → %s', (emote, mood) => {
    expect(emoteToMood(emote)).toBe(mood);
  });
});

describe('trimToSentence', () => {
  it('cuts a reply that stopped mid-sentence back to the last full one', () => {
    expect(trimToSentence('BMO loves you very much. Football says hello. And then BMO went to the')).toBe('BMO loves you very much. Football says hello.');
  });

  it('keeps text that has no good place to cut', () => {
    expect(trimToSentence('Hi. BMO is telling a very long story without stopping')).toBe('Hi. BMO is telling a very long story without stopping');
  });
});

describe('growing memory', () => {
  const today = '2026-10-01';
  const noGrowth = { followUps: [], words: [], diary: '' };

  it('loads an old save without the new fields', () => {
    const old = { profile: { name: 'Sam' }, history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }], stats: { visits: 3 } };
    const store = new Map([['bmo-memory-v1', JSON.stringify(old)]]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null });
    const loaded = loadMemory();
    vi.unstubAllGlobals();
    expect(loaded.stats.chats).toBe(1);  // Counted from the history it has
    expect(loaded.followUps).toEqual([]);
    expect(loaded.features).toEqual({ dreamed: [], used: [] });
    expect(loaded.stats.rpsThrows).toEqual([]);
  });

  it('finds a follow-up once its day has come, until it gets too old', () => {
    const followUps = [{ about: 'Trying dumplings again', askAfter: '2026-10-04' }];
    expect(dueFollowUp(followUps, today)).toBeNull();
    expect(dueFollowUp(followUps, '2026-10-04')?.about).toBe('Trying dumplings again');
    expect(dueFollowUp(followUps, addDays('2026-10-04', GROWTH_LIMITS.followUpExpiryDays + 1))).toBeNull();
  });

  it('merges new follow-ups and words without duplicates', () => {
    const memory = { ...emptyMemory(), words: [{ word: 'lekker', meaning: 'great' }], followUps: [{ about: 'Exam on Friday', askAfter: '2026-10-03' }] };
    const merged = mergeGrowth(memory, {
      followUps: [{ about: 'exam on friday', askAfter: '2026-10-04' }],
      words: [{ word: 'Lekker', meaning: 'great, tasty' }, { word: 'click it click it' }],
      diary: ''
    }, today);
    expect(merged.followUps).toEqual([{ about: 'exam on friday', askAfter: '2026-10-04' }]);
    expect(merged.words).toEqual([{ word: 'Lekker', meaning: 'great, tasty' }, { word: 'click it click it' }]);
  });

  it('keeps at most three diary lines a day and sixty days of diary', () => {
    let memory = { ...emptyMemory(), diary: [{ date: '2026-07-01', lines: ['Long ago'] }] };
    for (let i = 0; i < 5; i++) memory = mergeGrowth(memory, { ...noGrowth, diary: `Line ${i}` }, today);
    expect(memory.diary).toEqual([{ date: today, lines: ['Line 0', 'Line 1', 'Line 2'] }]);
  });

  it('sends only the newest diary lines and the words with each chat', () => {
    const memory = { ...emptyMemory(), words: [{ word: 'lekker' }], diary: [{ date: '2026-09-30', lines: ['a', 'b'] }, { date: today, lines: ['c', 'd'] }] };
    const payload = toPayload(memory);
    expect(payload.diary).toEqual(['b', 'c', 'd']);
    expect(payload.words).toEqual([{ word: 'lekker' }]);
  });

  it('remembers only the last 30 throws', () => {
    let throws = addThrow([], 'rock');
    for (let i = 0; i < 40; i++) throws = addThrow(throws, 'paper');
    expect(throws).toHaveLength(30);
    expect(throws[0]).toBe('paper');
  });
});
