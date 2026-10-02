// The friend's recipe book: dishes cooked with BMO, kept on this device (IndexedDB)
import { newId, runDb } from './localDb';

export interface Recipe {
  title: string;
  servings: string;
  minutes: number;
  ingredients: string[];
  steps: string[];
  fromPhoto: boolean;   // Copied from the friend's own recipe
  bmoVersion: boolean;  // Written by BMO (from a dish name or a fridge list)
}

export interface SavedRecipe {
  id: string;
  recipe: Recipe;
  photo?: Blob;         // How it turned out (last time)
  comment: string;      // What BMO said about it
  rating: number;       // 1–5 hearts (0 = not rated)
  tweak: string;        // What to change next time
  timesCooked: number;
  lastCooked: number;
  createdAt: number;
}

export const MAX_RECIPES = 100;

const run = <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => runDb<T>('recipes', mode, action);

const sameRecipe = (a: Recipe, b: Recipe) => a.title.trim().toLowerCase() === b.title.trim().toLowerCase();

// Which recipes to remove so at most `limit` remain (least recently cooked first)
export const recipesToTrim = (recipes: Pick<SavedRecipe, 'id' | 'lastCooked'>[], limit = MAX_RECIPES): string[] =>
  [...recipes].sort((a, b) => a.lastCooked - b.lastCooked).slice(0, Math.max(0, recipes.length - limit)).map(r => r.id);

export const listRecipes = async (): Promise<SavedRecipe[]> => {
  const all = (await run<SavedRecipe[]>('readonly', store => store.getAll() as IDBRequest<SavedRecipe[]>)) ?? [];
  return all.sort((a, b) => b.lastCooked - a.lastCooked);  // Most recently cooked first
};

// Save a finished dish: a recipe cooked again updates its entry (count, photo, rating, tweak)
export const saveCookedRecipe = async (
  recipe: Recipe, result: { photo?: Blob; comment: string; rating: number; tweak: string }, existingId?: string
): Promise<SavedRecipe | null> => {
  const all = await listRecipes();
  const existing = all.find(r => r.id === existingId) ?? all.find(r => sameRecipe(r.recipe, recipe));
  const now = Date.now();
  const saved: SavedRecipe = existing
    ? {
      ...existing,
      recipe,
      photo: result.photo ?? existing.photo,
      comment: result.comment || existing.comment,
      rating: result.rating || existing.rating,
      tweak: result.tweak,
      timesCooked: existing.timesCooked + 1,
      lastCooked: now
    }
    : { id: newId(), recipe, ...result, timesCooked: 1, lastCooked: now, createdAt: now };
  const ok = await run('readwrite', store => store.put(saved));
  if (ok === null) return null;
  for (const id of recipesToTrim([...all.filter(r => r.id !== saved.id), saved])) await deleteRecipe(id);
  return saved;
};

export const deleteRecipe = async (id: string): Promise<void> => {
  await run('readwrite', store => store.delete(id));
};

export const clearRecipes = async (): Promise<void> => {
  await run('readwrite', store => store.clear());
};
