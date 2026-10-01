import { describe, expect, it } from 'vitest';
import { BMOMemory, emptyMemory, mergeLearned, toPayload, trimHistory, MEMORY_LIMITS } from './memory';
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
