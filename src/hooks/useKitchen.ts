import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Recipe } from '../utils/recipeBook';
import { KitchenContext } from '../utils/api';
import { matchesIngredient } from '../utils/kitchenCommands';

// Where the friend is in kitchen mode:
// choose (what are we making?) → loading → shopping (ingredients) → cooking (steps) → photo → rating → tweak
export type KitchenPhase = 'choose' | 'loading' | 'shopping' | 'cooking' | 'photo' | 'rating' | 'tweak';

export interface KitchenSession {
  phase: KitchenPhase;
  recipe: Recipe | null;
  step: number;          // 0-based
  need: number[];        // Ingredient lines the friend doesn't have
  request: string;       // What they asked for (to ask for "something else")
  savedId?: string;      // Cooking a recipe from the recipe book again
  lastTweak?: string;    // What they wanted to change last time
  comment: string;       // What BMO said about the finished dish
  rating: number;
}

export type KitchenAction =
  | { type: 'start' }
  | { type: 'loading'; request: string }
  | { type: 'recipe'; recipe: Recipe }
  | { type: 'failed' }
  | { type: 'cookAgain'; recipe: Recipe; savedId: string; lastTweak: string }
  | { type: 'toggleNeed'; index: number }
  | { type: 'missing'; items: string[] }
  | { type: 'startCooking' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'finishCooking' }
  | { type: 'comment'; comment: string }
  | { type: 'rate'; rating: number }
  | { type: 'askTweak' }
  | { type: 'stop' };

const fresh = (): KitchenSession => ({ phase: 'choose', recipe: null, step: 0, need: [], request: '', comment: '', rating: 0 });

export const kitchenReducer = (state: KitchenSession | null, action: KitchenAction): KitchenSession | null => {
  if (action.type === 'start') return fresh();
  if (action.type === 'stop') return null;
  if (!state) return state;
  const steps = state.recipe?.steps.length ?? 0;
  switch (action.type) {
    case 'loading':
      return { ...state, phase: 'loading', request: action.request };
    case 'recipe':
      return { ...state, phase: 'shopping', recipe: action.recipe, step: 0, need: [], savedId: undefined, lastTweak: undefined };
    case 'failed':
      return { ...state, phase: 'choose' };
    case 'cookAgain':
      return { ...fresh(), phase: 'shopping', recipe: action.recipe, savedId: action.savedId, lastTweak: action.lastTweak || undefined };
    case 'toggleNeed':
      return {
        ...state,
        need: state.need.includes(action.index) ? state.need.filter(i => i !== action.index) : [...state.need, action.index]
      };
    case 'missing': {
      const lines = state.recipe?.ingredients ?? [];
      const found = lines.flatMap((line, i) => (action.items.some(item => matchesIngredient(item, line)) ? [i] : []));
      return { ...state, need: [...new Set([...state.need, ...found])] };
    }
    case 'startCooking':
      return state.recipe ? { ...state, phase: 'cooking', step: 0 } : state;
    case 'next':
      return state.step + 1 < steps ? { ...state, step: state.step + 1 } : { ...state, phase: 'photo' };
    case 'back':
      return { ...state, step: Math.max(0, state.step - 1) };
    case 'finishCooking':
      return { ...state, phase: 'photo' };
    case 'comment':
      return { ...state, comment: action.comment, phase: 'rating' };
    case 'rate':
      return { ...state, rating: Math.min(5, Math.max(1, action.rating)) };
    case 'askTweak':
      return { ...state, phase: 'tweak' };
    default:
      return state;
  }
};

// What a kitchen-mode chat should know about the recipe and step
export const kitchenContext = (session: KitchenSession | null): KitchenContext | undefined => {
  const recipe = session?.recipe;
  if (!recipe) return undefined;
  const step = Math.min(session.step, recipe.steps.length - 1);
  return {
    title: recipe.title,
    step: recipe.steps[step],
    stepNumber: step + 1,
    totalSteps: recipe.steps.length,
    ingredients: recipe.ingredients
  };
};

// The ingredient lines the friend doesn't have
export const neededIngredients = (session: KitchenSession | null): string[] =>
  session?.recipe ? session.need.map(i => session.recipe!.ingredients[i]).filter(Boolean) : [];

// --- Saved on this device, so a reload (or the phone sleeping) doesn't lose their place ---
const STORAGE_KEY = 'bmo-kitchen-v1';

export const loadKitchenSession = (): KitchenSession | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as KitchenSession | null;
    if (!saved || !saved.recipe || !Array.isArray(saved.recipe.steps)) return null;
    // A recipe being fetched or a camera that was open don't survive a reload: go back a step
    const phase: KitchenPhase = saved.phase === 'loading' ? 'choose' : saved.phase;
    return { ...fresh(), ...saved, phase };
  } catch {
    return null;
  }
};

const saveKitchenSession = (session: KitchenSession | null) => {
  try {
    if (session?.recipe) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not critical
  }
};

export const useKitchen = () => {
  const [session, dispatch] = useReducer(kitchenReducer, null, loadKitchenSession);
  // A ref too, so callbacks always see the latest session
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => saveKitchenSession(session), [session]);

  const getContext = useCallback(() => kitchenContext(sessionRef.current), []);

  return { session, sessionRef, dispatch, getContext };
};
