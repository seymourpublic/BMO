import { describe, expect, it } from 'vitest';
import {
  ALL_FEATURE_IDS, FEATURES, Hand, dueMilestone, milestonesCoveredBy, nextDream, pickBmoHand, predictThrow, smartChance
} from './growth';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 1);
const stats = (over: Partial<{ chats: number; firstVisit: number; photos: number; memories: number }> = {}) =>
  ({ chats: 0, firstVisit: 0, photos: 0, memories: 0, ...over });

describe('dreams about new features', () => {
  it('dreams about the first feature not yet dreamed or used', () => {
    expect(nextDream({ dreamed: [], used: [] })?.id).toBe(FEATURES[0].id);
    expect(nextDream({ dreamed: [FEATURES[0].id], used: [FEATURES[1].id] })?.id).toBe(FEATURES[2].id);
  });

  it('has nothing to dream about on a device that has seen everything', () => {
    expect(nextDream({ dreamed: ALL_FEATURE_IDS, used: [] })).toBeNull();
  });

  it('has a dream and a first-use line for every feature', () => {
    for (const feature of FEATURES) {
      expect(feature.dream.length).toBeGreaterThan(10);
      expect(feature.firstUse.length).toBeGreaterThan(10);
    }
  });
});

describe('milestones', () => {
  it('celebrates nothing for a new friend', () => {
    expect(dueMilestone(stats({ chats: 3, firstVisit: NOW }), [], NOW)).toBeNull();
  });

  it('celebrates the highest chat milestone reached, once', () => {
    expect(dueMilestone(stats({ chats: 50 }), [], NOW)).toBe('chats-50');
    expect(dueMilestone(stats({ chats: 130 }), [], NOW)).toBe('chats-100');
    expect(dueMilestone(stats({ chats: 130 }), milestonesCoveredBy('chats-100'), NOW)).toBeNull();
  });

  it('counts days together from the first visit', () => {
    expect(dueMilestone(stats({ firstVisit: NOW - 6 * DAY }), [], NOW)).toBeNull();
    expect(dueMilestone(stats({ firstVisit: NOW - 7 * DAY }), [], NOW)).toBe('days-7');
    expect(dueMilestone(stats({ firstVisit: NOW - 101 * DAY }), [], NOW)).toBe('days-100');
  });

  it('never counts days when the first visit is unknown', () => {
    expect(dueMilestone(stats({ firstVisit: 0, chats: 2 }), [], NOW)).toBeNull();
  });

  it('puts firsts before other milestones', () => {
    expect(dueMilestone(stats({ chats: 60, photos: 1 }), [], NOW)).toBe('first-photo');
    expect(dueMilestone(stats({ chats: 60, photos: 1 }), ['first-photo'], NOW)).toBe('chats-50');
  });

  it('a big milestone also covers the smaller ones of its kind', () => {
    expect(milestonesCoveredBy('chats-250')).toEqual(['chats-50', 'chats-100', 'chats-250']);
    expect(milestonesCoveredBy('first-memory')).toEqual(['first-memory']);
  });
});

describe('Rock Paper Scissors learning', () => {
  it('plays pure luck for the first five games', () => {
    expect(smartChance(0)).toBe(0);
    expect(smartChance(4)).toBe(0);
  });

  it('gets smarter with every game, up to a cap', () => {
    expect(smartChance(5)).toBeCloseTo(0.10);
    expect(smartChance(20)).toBeCloseTo(0.25);
    expect(smartChance(500)).toBe(0.45);
  });

  it('predicts what usually follows the last throw', () => {
    const throws: Hand[] = ['rock', 'paper', 'rock', 'paper', 'rock'];
    expect(predictThrow(throws)).toBe('paper');
  });

  it('falls back to the favourite throw', () => {
    expect(predictThrow(['scissors', 'scissors', 'rock'])).toBe('scissors');
  });

  it('needs a few throws before predicting', () => {
    expect(predictThrow(['rock'])).toBeNull();
  });

  it('counters the prediction when it plays smart', () => {
    const throws: Hand[] = ['rock', 'rock', 'rock', 'rock'];
    expect(pickBmoHand(throws, 100, () => 0)).toEqual({ hand: 'paper', smart: true });
  });

  it('plays randomly when the smart chance is not taken', () => {
    const result = pickBmoHand(['rock', 'rock', 'rock'], 100, () => 0.99);
    expect(result.smart).toBe(false);
  });

  it('wins more against a predictable player as it gets experienced', () => {
    const throws: Hand[] = Array(30).fill('rock');
    let rand = 0.5;
    const next = () => (rand = (rand * 9301 + 49297) % 233280 / 233280);
    const winRate = (games: number) => {
      let wins = 0;
      for (let i = 0; i < 2000; i++) if (pickBmoHand(throws, games, next).hand === 'paper') wins++;
      return wins / 2000;
    };
    expect(winRate(100)).toBeGreaterThan(winRate(0) + 0.2);
  });
});
