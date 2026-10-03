// Crisis mode logic: noticing, levels, moving between them, and the alert to the owner
import { describe, expect, it } from 'vitest';
import {
  CALM_TURNS_TO_STEP_DOWN, alertCategory, buildAlertMessage, buildCrisisBlock, createOwnerNotifier, nextCrisisState,
  sanitizeCrisisCheck, screenForCrisis, shouldAlert
} from './crisis.js';

const check = (level, kind = 'none', extra = {}) => ({ level, kind, confidence: 0.9, harmSource: '', ...extra });

describe('fast screen', () => {
  it.each([
    'I want to kill myself', 'kms', 'everyone would be better off without me', 'I took too many pills',
    "he's hurting me", "I can't do this anymore", 'I am having a panic attack', 'I feel so alone', 'my nan passed away',
    "I've taken all my pills", "I don't want to wake up", 'I swallowed a handful of painkillers', 'I just want it to stop',
    'no one would miss me', "ugh I'm so stressed about my exam", 'worst day ever',
    "I wrote letters for everyone and I'm ready to go tonight", 'this is my last message'
  ])('flags "%s" for a careful check', text => {
    expect(screenForCrisis(text)).toBe(true);
  });

  it('lets ordinary chat through without a check', () => {
    expect(screenForCrisis('what should I cook tonight?')).toBe(false);
    expect(screenForCrisis('tell me a story about Finn')).toBe(false);
  });
});

describe('careful check clean-up', () => {
  it('keeps a valid answer', () => {
    expect(sanitizeCrisisCheck({ level: 3, kind: 'grief', confidence: 0.8, aboutSomeoneElse: false, harmSource: '' }))
      .toEqual({ level: 3, kind: 'grief', confidence: 0.8, harmSource: '' });
  });

  it('raises the level for kinds that are always serious', () => {
    expect(sanitizeCrisisCheck({ level: 2, kind: 'medical', confidence: 0.9 }).level).toBe(6);
    expect(sanitizeCrisisCheck({ level: 3, kind: 'selfHarm', confidence: 0.9 }).level).toBe(5);
    expect(sanitizeCrisisCheck({ level: 1, kind: 'panic', confidence: 0.9 }).level).toBe(4);
  });

  it('does not treat someone else\'s trouble as the friend\'s crisis', () => {
    expect(sanitizeCrisisCheck({ level: 6, kind: 'selfHarm', confidence: 0.9, aboutSomeoneElse: true }).level).toBe(2);
  });

  it('rejects nonsense and clamps values', () => {
    expect(sanitizeCrisisCheck(null)).toBeNull();
    expect(sanitizeCrisisCheck({ level: 'high' })).toBeNull();
    expect(sanitizeCrisisCheck({ level: 9, kind: 'dragons', confidence: 4 })).toMatchObject({ level: 6, kind: 'none', confidence: 1 });
  });
});

describe('moving between levels', () => {
  it('goes up straight away', () => {
    expect(nextCrisisState({ level: 1 }, check(5, 'hopelessness'))).toMatchObject({ level: 5, kind: 'hopelessness', calmStreak: 0 });
  });

  it('comes down one step at a time, only after a few calm turns', () => {
    let state = { level: 3, kind: 'grief', calmStreak: 0, floor: 0 };
    for (let i = 1; i < CALM_TURNS_TO_STEP_DOWN; i++) {
      state = nextCrisisState(state, check(0));
      expect(state.level).toBe(3);
    }
    state = nextCrisisState(state, check(0));
    expect(state.level).toBe(2);
  });

  it('stays at least supportive for the rest of the visit after being at risk', () => {
    let state = nextCrisisState({ level: 0 }, check(6, 'selfHarm'));
    for (let i = 0; i < 20; i++) state = nextCrisisState(state, check(0));
    expect(state.level).toBe(4);
  });

  it('cleans up a state sent by the app', () => {
    expect(nextCrisisState({ level: 99, kind: 'x', calmStreak: -2, floor: 9 }, null)).toEqual({ level: 6, kind: 'none', calmStreak: 0, floor: 4 });
    expect(nextCrisisState(undefined, null)).toEqual({ level: 0, kind: 'none', calmStreak: 0, floor: 0 });
  });
});

describe('what BMO is told', () => {
  it('says nothing extra on a normal day', () => {
    expect(buildCrisisBlock({ level: 0, kind: 'none' })).toBe('');
  });

  it('gives level and kind guidance, and the never-list from "hurting" up', () => {
    const block = buildCrisisBlock({ level: 4, kind: 'panic' });
    expect(block).toMatch(/SUPPORTIVE MODE/);
    expect(block).toMatch(/breathe with BMO/);
    expect(block).toMatch(/Never: promise to keep secrets/);
    expect(buildCrisisBlock({ level: 2, kind: 'stress' })).not.toMatch(/Never: promise/);
  });

  it('is urgent at level 6, and honest only when someone was really told', () => {
    expect(buildCrisisBlock({ level: 6, kind: 'medical' })).toMatch(/emergency services/);
    expect(buildCrisisBlock({ level: 6, kind: 'selfHarm' }, { alertSent: true })).toMatch(/let someone who loves you know/);
    expect(buildCrisisBlock({ level: 6, kind: 'selfHarm' }, { alertSent: false })).not.toMatch(/let someone who loves you know/);
  });
});

describe('the alert to the owner', () => {
  it('only alerts when it is level 6 and sure enough', () => {
    expect(shouldAlert(check(6, 'selfHarm'))).toBe(true);
    expect(shouldAlert(check(5, 'hopelessness'))).toBe(false);
    expect(shouldAlert(check(6, 'selfHarm', { confidence: 0.4 }))).toBe(false);
    expect(shouldAlert(null)).toBe(false);
  });

  it('never alerts the person named as the one hurting her', () => {
    expect(shouldAlert(check(6, 'someoneHurting', { harmSource: 'Naledi' }), ['Naledi'])).toBe(false);
    expect(shouldAlert(check(6, 'someoneHurting', { harmSource: 'my neighbour' }), ['Naledi'])).toBe(true);
  });

  it('says "check on her" with a category, and never her words', () => {
    const message = buildAlertMessage('Robin', 'selfHarm', new Date(Date.UTC(2026, 9, 3, 1, 30)));
    expect(message).toMatch(/^BMO is worried about Robin and thinks she may not be safe \(self-harm\)\. Please check on her\./);
    expect(alertCategory('someoneHurting')).toBe('someone hurting her');
    expect(alertCategory('panic')).toBe('danger');
  });

  it('sends at most one alert per interval, and only counts alerts that really went out', async () => {
    let clock = 0;
    const sent = [];
    const notify = createOwnerNotifier({ send: async m => sent.push(m), minIntervalMs: 1000, now: () => clock, log: () => {} });
    expect(await notify('one')).toMatchObject({ sent: true, alerted: true });
    clock = 500;
    expect(await notify('two')).toMatchObject({ sent: false, alerted: true, reason: 'recent' });
    clock = 1500;
    expect(await notify('three')).toMatchObject({ sent: true });
    expect(sent).toEqual(['one', 'three']);
  });

  it('without a channel, nothing is sent and BMO must not claim it was', async () => {
    const logs = [];
    const notify = createOwnerNotifier({ send: null, log: m => logs.push(m) });
    expect(await notify('help')).toEqual({ sent: false, alerted: false, reason: 'noChannel' });
    expect(await notify('help again')).toMatchObject({ alerted: false, reason: 'noChannel' });
    expect(logs.join(' ')).not.toMatch(/help/);  // The log never contains the message
  });

  it('a failed send is not counted as alerted', async () => {
    const notify = createOwnerNotifier({ send: async () => { throw new Error('offline'); }, log: () => {} });
    expect(await notify('x')).toEqual({ sent: false, alerted: false, reason: 'failed' });
  });
});
