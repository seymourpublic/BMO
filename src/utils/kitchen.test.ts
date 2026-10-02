import { describe, expect, it } from 'vitest';
import {
  isNothingToChange, isStartCooking, matchesIngredient, parseKitchenCommand, parseMissing, parseRating, wantsSomethingElse
} from './kitchenCommands';
import { addItems, clearDone, toggleItem, MAX_SHOPPING_ITEMS } from './shoppingList';
import { recipesToTrim, MAX_RECIPES } from './recipeBook';
import { encodeUnder } from './images';
import { detectPhrase } from './easterEggs';
import { kitchenContext, kitchenReducer, neededIngredients } from '../hooks/useKitchen';

describe('kitchen commands', () => {
  it.each([
    ['next', 'next'], ['BMO, next step please', 'next'], ['okay what\'s next', 'next'], ['got it', 'next'],
    ['go back', 'back'], ['previous step', 'back'],
    ['can you repeat that', 'repeat'], ['say that again', 'repeat'],
    ['what do I need', 'ingredients'], ['ingredients', 'ingredients'],
    ['how many steps left', 'stepsLeft'],
    ["I'm done!", 'done'], ['it\'s ready', 'done'],
    ['stop cooking', 'stop'],
  ])('"%s" → %s', (said, command) => {
    expect(parseKitchenCommand(said)).toBe(command);
  });

  it('leaves real questions for BMO', () => {
    expect(parseKitchenCommand('can I use butter instead of oil')).toBeNull();
    expect(parseKitchenCommand('what should the sauce look like when I add the next bit of cream')).toBeNull();
  });

  it('knows when to start cooking', () => {
    expect(isStartCooking("let's go")).toBe(true);
    expect(isStartCooking('I have everything')).toBe(true);
    expect(isStartCooking('hmm')).toBe(false);
  });

  it('hears what is missing', () => {
    expect(parseMissing("I don't have coriander and lemons")).toEqual(['coriander', 'lemons']);
    expect(parseMissing("I'm out of eggs")).toEqual(['eggs']);
    expect(parseMissing('I have everything')).toEqual([]);
  });

  it('forgives spelling differences and plurals', () => {
    expect(matchesIngredient('chilli', '1 green chili, chopped')).toBe(true);
    expect(matchesIngredient('potatoes', '1 potato')).toBe(true);
  });

  it('matches a missing item to an ingredient line', () => {
    expect(matchesIngredient('lemons', '1 lemon, juiced')).toBe(true);
    expect(matchesIngredient('rice', '2 cups basmati rice')).toBe(true);
    expect(matchesIngredient('a', 'anything')).toBe(false);
  });

  it('understands ratings in words or numbers', () => {
    expect(parseRating('four hearts!')).toBe(4);
    expect(parseRating('it was a 5')).toBe(5);
    expect(parseRating('delicious')).toBeNull();
  });

  it('knows "nothing to change" and "something else"', () => {
    expect(isNothingToChange('nope, it was perfect')).toBe(true);
    expect(isNothingToChange('less chilli next time')).toBe(false);
    expect(wantsSomethingElse('something else please')).toBe(true);
  });
});

describe('shopping list', () => {
  it('adds items without duplicates, and brings ticked ones back', () => {
    let list = addItems([], ['Coriander', 'eggs']);
    list = toggleItem(list, 1);
    list = addItems(list, ['coriander', 'Eggs', 'milk']);
    expect(list).toEqual([{ text: 'Coriander', done: false }, { text: 'eggs', done: false }, { text: 'milk', done: false }]);
  });

  it('clears ticked items and stays within its limit', () => {
    expect(clearDone([{ text: 'a', done: true }, { text: 'b', done: false }])).toEqual([{ text: 'b', done: false }]);
    expect(addItems([], Array.from({ length: 80 }, (_, i) => `item ${i}`))).toHaveLength(MAX_SHOPPING_ITEMS);
  });
});

describe('recipe book', () => {
  it('removes the least recently cooked recipes beyond the limit', () => {
    const recipes = Array.from({ length: MAX_RECIPES + 2 }, (_, i) => ({ id: `r${i}`, lastCooked: 1000 + i }));
    expect(recipesToTrim(recipes)).toEqual(['r0', 'r1']);
  });
});

describe('readable photos', () => {
  const fakeEncoder = (sizes: Record<number, number>) => async (quality: number) => new Blob([new Uint8Array(sizes[quality])]);

  it('steps quality down until the photo fits', async () => {
    const blob = await encodeUnder(fakeEncoder({ 0.8: 500, 0.7: 300, 0.6: 200 }), 250, [0.8, 0.7, 0.6]);
    expect(blob.size).toBe(200);
  });

  it('keeps the best quality when it already fits', async () => {
    const blob = await encodeUnder(fakeEncoder({ 0.8: 100 }), 250, [0.8, 0.7]);
    expect(blob.size).toBe(100);
  });
});

describe('kitchen phrases', () => {
  it.each([
    ["BMO, let's cook!", 'cook'], ['what can I make with chicken and rice', 'cook'], ['kitchen mode', 'cook'],
    ['show my recipe book', 'recipeBook'], ["what's on my shopping list", 'shoppingList'],
  ])('"%s" → %s', (said, egg) => {
    expect(detectPhrase(said)).toBe(egg);
  });
});

describe('kitchen session', () => {
  const recipe = {
    title: 'Chakalaka', servings: '4 people', minutes: 40, fromPhoto: false, bmoVersion: true,
    ingredients: ['2 onions, chopped', '1 tin baked beans', '1 handful fresh coriander'],
    steps: ['Fry the onions.', 'Add the beans.', 'Stir in the coriander.']
  };
  const cooking = () => kitchenReducer(kitchenReducer(kitchenReducer(null, { type: 'start' }), { type: 'recipe', recipe }), { type: 'startCooking' })!;

  it('goes from choosing to the ingredients to cooking', () => {
    let s = kitchenReducer(null, { type: 'start' });
    expect(s?.phase).toBe('choose');
    s = kitchenReducer(s, { type: 'loading', request: 'chakalaka' });
    s = kitchenReducer(s, { type: 'recipe', recipe });
    expect(s?.phase).toBe('shopping');
    expect(cooking().phase).toBe('cooking');
  });

  it('marks what the friend is missing', () => {
    const s = kitchenReducer(kitchenReducer(kitchenReducer(null, { type: 'start' }), { type: 'recipe', recipe }), { type: 'missing', items: ['coriander'] });
    expect(neededIngredients(s)).toEqual(['1 handful fresh coriander']);
  });

  it('moves through the steps and asks for a photo after the last one', () => {
    let s = cooking();
    s = kitchenReducer(s, { type: 'back' })!;
    expect(s.step).toBe(0);
    s = kitchenReducer(kitchenReducer(s, { type: 'next' }), { type: 'next' })!;
    expect(kitchenContext(s)).toMatchObject({ stepNumber: 3, totalSteps: 3, step: 'Stir in the coriander.' });
    expect(kitchenReducer(s, { type: 'next' })?.phase).toBe('photo');
  });

  it('keeps ratings between 1 and 5', () => {
    expect(kitchenReducer(cooking(), { type: 'rate', rating: 9 })?.rating).toBe(5);
  });

  it('goes back to choosing if BMO could not read the recipe', () => {
    const s = kitchenReducer(kitchenReducer(null, { type: 'start' }), { type: 'loading', request: 'x' });
    expect(kitchenReducer(s, { type: 'failed' })?.phase).toBe('choose');
  });
});
