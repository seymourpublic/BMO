import { useCallback, useRef, useState } from 'react';
import { Mood } from '../types';
import { KitchenAction, KitchenSession, kitchenReducer, neededIngredients, useKitchen } from './useKitchen';
import { KitchenCamera } from '../components/KitchenScreen';
import { CapturedPhoto } from '../components/CameraView';
import { PhotoForBmo, fetchRecipe } from '../utils/api';
import { ImageError, blobToDataUrl, shrinkPageForReading } from '../utils/images';
import {
  isNothingToChange, isStartCooking, matchesIngredient, parseKitchenCommand, parseMissing, parseRating, wantsSomethingElse
} from '../utils/kitchenCommands';
import { Recipe, SavedRecipe, saveCookedRecipe } from '../utils/recipeBook';
import { FeatureId } from '../utils/growth';
import { FollowUp, addDays, localDate } from '../utils/memory';

interface Options {
  kitchen: ReturnType<typeof useKitchen>;
  quickLine: (text: string, mood: Mood, spoken: boolean) => Promise<void>;
  ask: (text: string) => void;  // A question for BMO (chat with the recipe and step as context)
  lookAtPhoto: (photo: PhotoForBmo, onComment?: (comment: string) => void) => Promise<string | null>;
  setMood: (mood: Mood) => void;
  setCaption: (text: string) => void;
  enterMode: () => void;
  exitMode: () => void;
  interrupt: () => void;
  firstUse: (id: FeatureId) => string | null;
  recordDish: () => void;
  addFollowUp: (followUp: FollowUp) => void;
  addToShopping: (items: string[]) => void;
}

const RATING_LINES: Record<number, string> = {
  5: 'FIVE hearts! BMO knew it!',
  4: 'Four hearts! So yummy!',
  3: 'Three hearts! Pretty good, chef!',
  2: 'Two hearts. Every chef has those days!',
  1: 'Aww, one heart. BMO is still proud of you for trying!'
};
const SKIP_PHOTO = /\b(skip|no photo|no picture|no thanks|not now)\b/i;
const TAKE_PHOTO = /\b(photo|picture|camera|ready|yes|yeah|ok(ay)?|sure)\b/i;

// Kitchen mode: turns what the friend says and taps into recipe steps, lines from BMO and saved dishes
export const useKitchenCompanion = (o: Options) => {
  const [camera, setCamera] = useState<KitchenCamera>(null);
  const dishPhotoRef = useRef<Blob | undefined>(undefined);
  const opts = useRef(o);
  opts.current = o;

  // Apply an action now (so the next line sees it) and keep React's state in step
  const act = useCallback((action: KitchenAction): KitchenSession | null => {
    const { kitchen } = opts.current;
    const next = kitchenReducer(kitchen.sessionRef.current, action);
    kitchen.sessionRef.current = next;
    kitchen.dispatch(action);
    return next;
  }, []);

  const current = () => opts.current.kitchen.sessionRef.current;

  const sayStep = useCallback((session: KitchenSession | null) => {
    const recipe = session?.recipe;
    if (!recipe) return;
    const last = session.step + 1 === recipe.steps.length;
    opts.current.interrupt();  // A new step replaces whatever BMO was saying
    opts.current.quickLine(`Step ${session.step + 1}${last ? ', the last one' : ''}. ${recipe.steps[session.step]}`, 'happy', true);
  }, []);

  const readIngredients = useCallback(() => {
    const recipe = current()?.recipe;
    if (recipe) opts.current.quickLine(`You need: ${recipe.ingredients.join('; ')}.`, 'happy', true);
  }, []);

  const announceRecipe = useCallback((recipe: Recipe, intro: string) => {
    const count = recipe.ingredients.length;
    opts.current.quickLine(
      `${intro} ${count} ingredient${count === 1 ? '' : 's'}, ${recipe.steps.length} steps. Tap anything you don't have, or tell BMO. Say "let's go" when you're ready!`,
      'excited', true
    );
  }, []);

  // Ask the backend for a recipe from a photo or a request
  const requestRecipe = useCallback(async (input: { image?: string; request?: string }) => {
    const { setMood, setCaption, quickLine } = opts.current;
    act({ type: 'loading', request: input.request ?? current()?.request ?? '' });
    setMood('thinking');
    setCaption(input.image ? 'BMO is reading the recipe…' : 'BMO is thinking of something yummy…');
    try {
      const recipe = await fetchRecipe(input);
      if (!current()) return;  // Left the kitchen meanwhile
      if (!recipe) {
        act({ type: 'failed' });
        quickLine(input.image
          ? "BMO can't read that one… try a closer photo, or tell BMO the dish!"
          : "Hmm, BMO doesn't know how to make that. Try telling BMO another dish, or what's in your fridge!", 'confused', true);
        return;
      }
      act({ type: 'recipe', recipe });
      announceRecipe(recipe, recipe.bmoVersion ? `Here's BMO's version of ${recipe.title}!` : `Ooh, ${recipe.title}!`);
    } catch (error) {
      if (!current()) return;
      act({ type: 'failed' });
      quickLine(error instanceof Error && error.message ? error.message : "BMO's kitchen brain got confused. Try again?", 'confused', true);
    }
  }, [act, announceRecipe]);

  const enter = useCallback(() => {
    const { interrupt, enterMode, firstUse, quickLine } = opts.current;
    interrupt();
    act({ type: 'start' });
    setCamera(null);
    dishPhotoRef.current = undefined;
    enterMode();
    const surprise = firstUse('kitchen');
    quickLine(
      `${surprise ? `${surprise} ` : ''}What are we making? Show BMO a recipe with the camera, or tell BMO a dish, or what's in your fridge!`,
      'excited', true
    );
  }, [act]);

  const cookAgain = useCallback((saved: SavedRecipe) => {
    const { interrupt, enterMode, quickLine } = opts.current;
    interrupt();
    act({ type: 'cookAgain', recipe: saved.recipe, savedId: saved.id, lastTweak: saved.tweak });
    setCamera(null);
    dishPhotoRef.current = undefined;
    enterMode();
    quickLine(
      `${saved.recipe.title} again? Yay!${saved.tweak ? ` Last time you said: ${saved.tweak}.` : ''} Tap anything you don't have, or say "let's go"!`,
      'excited', true
    );
  }, [act]);

  // Back in the kitchen after a reload or a nap: pick up where they left off
  const resume = useCallback((): boolean => {
    const session = current();
    if (!session?.recipe || session.phase === 'choose') return false;
    opts.current.enterMode();
    const where = session.phase === 'cooking' ? ` You were on step ${session.step + 1}!` : '';
    opts.current.quickLine(`Shall we keep cooking ${session.recipe.title}?${where}`, 'excited', true)
      .then(() => { if (current()?.phase === 'cooking') sayStep(current()); });
    return true;
  }, [sayStep]);

  const startCooking = useCallback(() => {
    const { addToShopping, quickLine } = opts.current;
    const needed = neededIngredients(current());
    if (needed.length) addToShopping(needed);
    const session = act({ type: 'startCooking' });
    if (needed.length) {
      quickLine(`BMO put ${needed.length} thing${needed.length === 1 ? '' : 's'} on your shopping list. Let's cook!`, 'excited', true)
        .then(() => sayStep(current()));
    } else sayStep(session);
  }, [act, sayStep]);

  const finishedCooking = useCallback(() => {
    opts.current.quickLine('Yay, you did it! Show BMO how it turned out! Tap the camera, or say skip.', 'excited', true);
  }, []);

  const next = useCallback(() => {
    const session = act({ type: 'next' });
    if (session?.phase === 'photo') finishedCooking();
    else sayStep(session);
  }, [act, sayStep, finishedCooking]);

  const back = useCallback(() => sayStep(act({ type: 'back' })), [act, sayStep]);

  const askRating = useCallback(() => {
    opts.current.quickLine('How did it taste? Tap the hearts, or tell BMO one to five!', 'happy', true);
  }, []);

  const skipPhoto = useCallback(() => {
    setCamera(null);
    act({ type: 'comment', comment: '' });
    askRating();
  }, [act, askRating]);

  const rate = useCallback((rating: number) => {
    act({ type: 'rate', rating });
    act({ type: 'askTweak' });
    opts.current.quickLine(`${RATING_LINES[Math.min(5, Math.max(1, rating))]} Anything you'd change next time?`, 'love', true);
  }, [act]);

  // Save the dish to the recipe book and hang up the chef hat
  const finish = useCallback(async (tweak: string) => {
    const { recordDish, addFollowUp, exitMode, quickLine } = opts.current;
    const session = current();
    if (!session?.recipe) return;
    const { recipe, comment, rating, savedId } = session;
    act({ type: 'stop' });
    exitMode();
    await saveCookedRecipe(recipe, { photo: dishPhotoRef.current, comment, rating, tweak }, savedId);
    dishPhotoRef.current = undefined;
    recordDish();
    addFollowUp({
      about: `Friend cooked ${recipe.title}${rating ? ` and gave it ${rating} hearts` : ''}`.slice(0, 120),
      askAfter: addDays(localDate(), 1)
    });
    quickLine(`Saved in your recipe book!${tweak ? ' BMO will remember that for next time.' : ''} BMO hangs up its chef hat. That was so fun!`, 'love', true);
  }, [act]);

  // Red button or "stop cooking"
  const leave = useCallback((announce = true) => {
    act({ type: 'stop' });
    setCamera(null);
    dishPhotoRef.current = undefined;
    opts.current.exitMode();
    if (announce) opts.current.quickLine('BMO hangs up its chef hat. Bye bye, kitchen!', 'happy', true);
  }, [act]);

  const openCamera = useCallback((kind: Exclude<KitchenCamera, null>) => {
    opts.current.interrupt();
    setCamera(kind);
  }, []);

  const onCapture = useCallback(async (photo: CapturedPhoto) => {
    const kind = camera;
    setCamera(null);
    if (kind === 'recipe') {
      await requestRecipe({ image: await blobToDataUrl(photo.forReading ?? photo.forAi) });
      return;
    }
    // The finished dish
    dishPhotoRef.current = photo.album;
    const title = current()?.recipe?.title;
    const comment = await opts.current.lookAtPhoto({ image: await blobToDataUrl(photo.forAi), kind: 'dish', caption: title });
    act({ type: 'comment', comment: comment ?? '' });
    askRating();
  }, [camera, requestRecipe, act, askRating]);

  const onCameraError = useCallback((message: string) => {
    setCamera(null);
    opts.current.quickLine(message, 'confused', true);
  }, []);

  const onPickRecipe = useCallback(async (file: File) => {
    try {
      const page = await shrinkPageForReading(file);
      await requestRecipe({ image: await blobToDataUrl(page) });
    } catch (error) {
      opts.current.quickLine(error instanceof ImageError ? error.message : "BMO couldn't open that picture. Try a different one?", 'confused', true);
    }
  }, [requestRecipe]);

  const toggleNeed = useCallback((index: number) => { act({ type: 'toggleNeed', index }); }, [act]);

  // Everything the friend says or types while in the kitchen
  const handleInput = useCallback((text: string) => {
    const { ask, quickLine } = opts.current;
    const session = current();
    if (!session) return;
    const command = parseKitchenCommand(text);
    if (command === 'stop') {
      leave();
      return;
    }
    switch (session.phase) {
      case 'choose':
        requestRecipe({ request: text });
        return;
      case 'loading':
        quickLine('BMO is still working on it! One second…', 'thinking', false);
        return;
      case 'shopping': {
        const missing = parseMissing(text);
        if (missing.length) {
          act({ type: 'missing', items: missing });
          // Things that aren't in the recipe go straight onto the shopping list
          const ingredients = session.recipe?.ingredients ?? [];
          const extra = missing.filter(item => !ingredients.some(line => matchesIngredient(item, line)));
          if (extra.length) opts.current.addToShopping(extra);
          quickLine(`Okay! BMO will put ${missing.join(' and ')} on your shopping list.`, 'happy', true);
        } else if (wantsSomethingElse(text) && session.recipe?.bmoVersion) {
          requestRecipe({ request: `Something different from ${session.recipe.title}. What they first asked for: ${session.request}`.slice(0, 300) });
        } else if (command === 'ingredients') readIngredients();
        else if (isStartCooking(text)) startCooking();
        else ask(text);
        return;
      }
      case 'cooking':
        if (command === 'next') next();
        else if (command === 'back') back();
        else if (command === 'repeat') sayStep(session);
        else if (command === 'ingredients') readIngredients();
        else if (command === 'stepsLeft') {
          const left = (session.recipe?.steps.length ?? 0) - session.step - 1;
          quickLine(left ? `${left} more step${left === 1 ? '' : 's'} after this one!` : "This is the last step! You're nearly there!", 'happy', true);
        } else if (command === 'done') {
          act({ type: 'finishCooking' });
          finishedCooking();
        } else ask(text);
        return;
      case 'photo':
        if (SKIP_PHOTO.test(text)) skipPhoto();
        else if (TAKE_PHOTO.test(text)) openCamera('dish');
        else ask(text);
        return;
      case 'rating': {
        const rating = parseRating(text);
        if (rating) rate(rating);
        else quickLine('How many hearts? One to five!', 'happy', true);
        return;
      }
      case 'tweak':
        finish(isNothingToChange(text) ? '' : text.trim().slice(0, 200));
        return;
    }
  }, [act, leave, requestRecipe, readIngredients, startCooking, next, back, sayStep, finishedCooking, skipPhoto, openCamera, rate, finish]);

  return {
    camera, enter, cookAgain, resume, leave, handleInput,
    toggleNeed, startCooking, next, back, rate, openCamera, onCapture, onCameraError, onPickRecipe, skipPhoto
  };
};
