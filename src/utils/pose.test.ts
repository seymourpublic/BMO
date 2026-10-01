import { describe, expect, it } from 'vitest';
import { poseFor } from './pose';

const base = { dancing: false, waving: false, asleep: false, speaking: false, mood: 'happy' as const };

describe('poseFor', () => {
  it('sways gently when nothing is happening', () => {
    expect(poseFor(base)).toBe('sway');
  });

  it('dancing beats everything else', () => {
    expect(poseFor({ ...base, dancing: true, waving: true, asleep: true, mood: 'sad' })).toBe('dance');
  });

  it('waves hello before anything but dancing', () => {
    expect(poseFor({ ...base, waving: true, speaking: true })).toBe('wave');
  });

  it('breathes slowly while asleep', () => {
    expect(poseFor({ ...base, asleep: true })).toBe('sleep');
  });

  it('throws its arms up when surprised, even mid-sentence', () => {
    expect(poseFor({ ...base, mood: 'surprised', speaking: true })).toBe('surprise');
  });

  it('droops when sad or crying', () => {
    expect(poseFor({ ...base, mood: 'sad' })).toBe('droop');
    expect(poseFor({ ...base, mood: 'crying', speaking: true })).toBe('droop');
  });

  it('gestures while talking', () => {
    expect(poseFor({ ...base, speaking: true })).toBe('talk');
  });

  it('bounces when excited, starry or in love', () => {
    expect(poseFor({ ...base, mood: 'excited' })).toBe('bounce');
    expect(poseFor({ ...base, mood: 'starry' })).toBe('bounce');
    expect(poseFor({ ...base, mood: 'love' })).toBe('bounce');
  });
});
