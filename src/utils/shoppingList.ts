// The friend's shopping list, kept on this device

export interface ShoppingItem {
  text: string;
  done: boolean;  // Bought / ticked off
}

export const MAX_SHOPPING_ITEMS = 60;
const MAX_ITEM_CHARS = 80;
const STORAGE_KEY = 'bmo-shopping-v1';

// Add items, skipping ones already on the list (ticked-off duplicates come back as needed)
export const addItems = (list: ShoppingItem[], items: string[]): ShoppingItem[] => {
  let next = [...list];
  for (const raw of items) {
    const text = raw.trim().slice(0, MAX_ITEM_CHARS);
    if (!text) continue;
    const existing = next.find(i => i.text.toLowerCase() === text.toLowerCase());
    if (existing) next = next.map(i => (i === existing ? { ...i, done: false } : i));
    else next.push({ text, done: false });
  }
  return next.slice(-MAX_SHOPPING_ITEMS);
};

export const toggleItem = (list: ShoppingItem[], index: number): ShoppingItem[] =>
  list.map((item, i) => (i === index ? { ...item, done: !item.done } : item));

export const clearDone = (list: ShoppingItem[]): ShoppingItem[] => list.filter(i => !i.done);

export const loadShoppingList = (): ShoppingItem[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(i => typeof i?.text === 'string').map(i => ({ text: i.text, done: !!i.done })) : [];
  } catch {
    return [];
  }
};

export const saveShoppingList = (list: ShoppingItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Not critical
  }
};

export const clearShoppingList = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
};
