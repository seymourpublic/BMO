import React, { useEffect, useMemo, useState } from 'react';
import { Sheet } from './Sheet';
import { SavedRecipe, deleteRecipe, listRecipes } from '../utils/recipeBook';

interface RecipeBookPanelProps {
  onCookAgain: (saved: SavedRecipe) => void;
  onClose: () => void;
}

const hearts = (n: number) => (n ? '❤️'.repeat(n) + '🤍'.repeat(5 - n) : '');

// The friend's recipe book: everything cooked with BMO
export const RecipeBookPanel: React.FC<RecipeBookPanelProps> = ({ onCookAgain, onClose }) => {
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [open, setOpen] = useState<SavedRecipe | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let current = true;
    listRecipes().then(all => { if (current) setRecipes(all); });
    return () => { current = false; };
  }, []);

  // Object URLs for the dish photos, freed when the panel closes
  const urls = useMemo(() => new Map((recipes ?? []).filter(r => r.photo).map(r => [r.id, URL.createObjectURL(r.photo!)])), [recipes]);
  useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls]);

  const remove = async (saved: SavedRecipe) => {
    await deleteRecipe(saved.id);
    setRecipes(list => (list ?? []).filter(r => r.id !== saved.id));
    setOpen(null);
    setConfirmDelete(false);
  };

  if (open) {
    const { recipe } = open;
    return (
      <Sheet title={recipe.title} onClose={() => setOpen(null)}>
        {urls.get(open.id) && <img src={urls.get(open.id)} alt={recipe.title} className="w-full max-h-56 object-cover rounded-xl" />}
        <p className="mt-3 text-sm">
          {hearts(open.rating)} · cooked {open.timesCooked} time{open.timesCooked === 1 ? '' : 's'}
          {recipe.minutes ? ` · ${recipe.minutes} min` : ''}{recipe.servings ? ` · ${recipe.servings}` : ''}
        </p>
        {open.tweak && <p className="mt-2 text-sm"><b>Next time:</b> {open.tweak}</p>}
        {open.comment && <p className="mt-2 text-sm italic opacity-80">BMO said: “{open.comment}”</p>}
        {recipe.bmoVersion && <p className="mt-2 text-xs opacity-60">BMO's version</p>}
        <h3 className="mt-4 text-sm font-bold">Ingredients</h3>
        <ul className="mt-1 text-sm list-disc pl-5">{recipe.ingredients.map((line, i) => <li key={i}>{line}</li>)}</ul>
        <h3 className="mt-3 text-sm font-bold">Steps</h3>
        <ol className="mt-1 text-sm list-decimal pl-5 space-y-1">{recipe.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" onClick={() => onCookAgain(open)} className="rounded-full px-4 py-2 text-sm font-bold text-white bg-[#43b649]">
            🍳 Cook it again
          </button>
          <button type="button" onClick={() => { setOpen(null); setConfirmDelete(false); }} className="rounded-full px-4 py-2 text-sm font-semibold bg-white border">
            ← Back
          </button>
          {confirmDelete ? (
            <>
              <button type="button" onClick={() => remove(open)} className="rounded-full px-4 py-2 text-sm font-bold text-white bg-[#e43d3d]">Delete it</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-2 text-sm">Keep it</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-full px-4 py-2 text-sm font-semibold text-[#c62828]">Delete</button>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="Recipe book" onClose={onClose}>
      {recipes === null ? (
        <p className="text-sm opacity-70 text-center py-4">Opening the recipe book…</p>
      ) : recipes.length === 0 ? (
        <p className="text-sm opacity-70 text-center py-4">No recipes yet. Say "BMO, let's cook!" and BMO will help you make something yummy.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 items-start">
          {recipes.map(saved => (
            <button key={saved.id} type="button" onClick={() => setOpen(saved)} className="bg-white rounded-xl shadow text-left overflow-hidden">
              {urls.get(saved.id)
                ? <img src={urls.get(saved.id)} alt="" className="w-full aspect-[4/3] object-cover" loading="lazy" />
                : <span className="flex w-full aspect-[4/3] items-center justify-center text-4xl bg-[#fff4e0]" aria-hidden="true">🍲</span>}
              <span className="block px-2 pt-1.5 text-sm font-bold leading-tight line-clamp-2">{saved.recipe.title}</span>
              <span className="block px-2 pb-2 text-[11px] opacity-70">{hearts(saved.rating)} {saved.timesCooked > 1 ? `· ${saved.timesCooked}×` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
};
