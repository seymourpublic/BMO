// Study cards: quiz questions the friend found hard, asked again on later days until mastered.
// Kept on this device.
import { addDays } from './memory';

export interface QuizQuestion {
  q: string;
  answer: string;
  why: string;
}

export interface StudyCard extends QuizQuestion {
  id: string;
  topic: string;
  box: number;      // 1–5: how well it's known (each right answer moves it up)
  due: string;      // YYYY-MM-DD it should be asked again
  mastered: boolean;
}

export interface StudyData {
  cards: StudyCard[];
  focusMinutes: number;  // Total minutes of focus rounds finished
}

export const MAX_CARDS = 200;
// Days until a card comes back after a right answer, by the box it moves into
const INTERVALS: Record<number, number> = { 2: 2, 3: 4, 4: 7, 5: 14 };
const STORAGE_KEY = 'bmo-study-v1';

const sameQuestion = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Missed quiz questions become cards (back tomorrow); one already there starts again from box 1
export const addMissed = (cards: StudyCard[], missed: QuizQuestion[], topic: string, today: string): StudyCard[] => {
  let next = [...cards];
  for (const question of missed) {
    const existing = next.find(c => sameQuestion(c.q, question.q));
    const due = addDays(today, 1);
    if (existing) next = next.map(c => (c === existing ? { ...c, box: 1, due, mastered: false } : c));
    else next.push({ ...question, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, topic, box: 1, due, mastered: false });
  }
  // Over the limit: drop mastered cards first, then the oldest
  while (next.length > MAX_CARDS) {
    const index = next.findIndex(c => c.mastered);
    next.splice(index >= 0 ? index : 0, 1);
  }
  return next;
};

// After a review: right moves the card up a box (and further away); wrong starts it again tomorrow.
// A right answer from box 5 means it's mastered.
export const reviewCard = (card: StudyCard, right: boolean, today: string): StudyCard => {
  if (!right) return { ...card, box: 1, due: addDays(today, 1), mastered: false };
  if (card.box >= 5) return { ...card, mastered: true };
  const box = card.box + 1;
  return { ...card, box, due: addDays(today, INTERVALS[box]) };
};

// Cards to ask today, most overdue first
export const dueCards = (cards: StudyCard[], today: string): StudyCard[] =>
  cards.filter(c => !c.mastered && c.due <= today).sort((a, b) => a.due.localeCompare(b.due));

export const loadStudy = (): StudyData => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return {
      cards: Array.isArray(saved?.cards) ? saved.cards.filter((c: StudyCard) => typeof c?.q === 'string') : [],
      focusMinutes: typeof saved?.focusMinutes === 'number' ? saved.focusMinutes : 0
    };
  } catch {
    return { cards: [], focusMinutes: 0 };
  }
};

export const saveStudy = (data: StudyData) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Not critical
  }
};

export const clearStudy = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
};
