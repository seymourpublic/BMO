import { describe, expect, it } from 'vitest';
import { MAX_LOOKS, isAccessory, safeColour, showIsFull, wantsFinale, wantsNextLook, wornOutfit } from './fashion';
import { detectPhrase } from './easterEggs';

describe('fashion phrases', () => {
  it.each([
    ["BMO, let's do a fashion show!", 'fashionShow'], ['how do I look?', 'outfitCheck'], ['outfit check', 'outfitCheck'],
    ["open BMO's wardrobe", 'wardrobe'], ['dress up BMO', 'wardrobe'],
  ])('"%s" → %s', (said, egg) => {
    expect(detectPhrase(said)).toBe(egg);
  });
});

describe('the show', () => {
  it('knows when the friend wants the finale or the next look', () => {
    expect(wantsFinale("that's all!")).toBe(true);
    expect(wantsFinale('finale time')).toBe(true);
    expect(wantsFinale('I love this dress')).toBe(false);
    expect(wantsNextLook('ready!')).toBe(true);
    expect(wantsNextLook('next look')).toBe(true);
  });

  it('goes to the finale after the last look', () => {
    expect(showIsFull(MAX_LOOKS - 1)).toBe(false);
    expect(showIsFull(MAX_LOOKS)).toBe(true);
  });
});

describe('outfits', () => {
  it('only accepts known accessories and real colours', () => {
    expect(isAccessory('tiara')).toBe(true);
    expect(isAccessory('jetpack')).toBe(false);
    expect(safeColour('#d94f8a', '#000000')).toBe('#d94f8a');
    expect(safeColour('pink', '#000000')).toBe('#000000');
    expect(safeColour('', '#123456')).toBe('#123456');
  });

  it('wears the look from the show over the chosen outfit', () => {
    const chosen = { accessory: 'bow' as const, colour: '#ffffff' };
    const show = { accessory: 'tiara' as const, colour: '#d94f8a' };
    expect(wornOutfit(show, chosen)).toBe(show);
    expect(wornOutfit(null, chosen)).toBe(chosen);
    expect(wornOutfit(null, null)).toBeNull();
  });
});
