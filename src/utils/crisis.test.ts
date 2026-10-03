import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_CRISIS, asksToCheckIn, calmWake, loadCrisis, saveCrisis, saysYes, softenMood, wantsBreathing } from './crisis';

// A tiny localStorage for these tests
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k)
  });
});
afterEach(() => vi.unstubAllGlobals());

const HOUR = 3_600_000;
const T = 1_000_000_000;

describe('crisis state on the device', () => {
  it('starts normal', () => {
    expect(loadCrisis(T)).toEqual(NO_CRISIS);
  });

  it('survives a reload mid-conversation, but not a later visit', () => {
    saveCrisis({ level: 4, kind: 'panic', calmStreak: 0, floor: 4 }, T);
    expect(loadCrisis(T + HOUR).level).toBe(4);
    expect(loadCrisis(T + 3 * HOUR)).toEqual(NO_CRISIS);
  });

  it('makes the next wake calm after being at risk, for a day', () => {
    saveCrisis({ level: 6, kind: 'selfHarm', calmStreak: 0, floor: 4 }, T);
    saveCrisis({ level: 4, kind: 'selfHarm', calmStreak: 0, floor: 4 }, T + HOUR);  // Calmer later
    expect(calmWake(T + 10 * HOUR)).toBe(true);
    expect(calmWake(T + 25 * HOUR)).toBe(false);
  });

  it('does not make the next wake calm after an ordinary heavy day', () => {
    saveCrisis({ level: 3, kind: 'grief', calmStreak: 0, floor: 0 }, T);
    expect(calmWake(T + HOUR)).toBe(false);
  });
});

describe('crisis phrases and faces', () => {
  it('hears "breathe with BMO"', () => {
    expect(wantsBreathing('can you breathe with me')).toBe(true);
    expect(wantsBreathing("let's breathe")).toBe(true);
    expect(wantsBreathing('I can breathe fine')).toBe(false);
  });

  it('hears a yes to a check-in', () => {
    expect(asksToCheckIn('Can BMO check on you tomorrow?')).toBe(true);
    expect(saysYes('yes please')).toBe(true);
    expect(saysYes('no thanks')).toBe(false);
  });

  it('softens bright faces in hard moments', () => {
    expect(softenMood('excited', 4)).toBe('calm');
    expect(softenMood('sad', 4)).toBe('sad');
    expect(softenMood('excited', 1)).toBe('excited');
  });
});
