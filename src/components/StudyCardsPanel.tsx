import React, { useMemo } from 'react';
import { Sheet } from './Sheet';
import { StudyCard } from '../utils/studyCards';

interface StudyCardsPanelProps {
  cards: StudyCard[];
  dueCount: number;
  onReview: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// How well a card is known: five dots, one per box
const progress = (card: StudyCard) => (card.mastered ? '⭐ Mastered' : '●'.repeat(card.box) + '○'.repeat(5 - card.box));

// The friend's study cards, grouped by topic
export const StudyCardsPanel: React.FC<StudyCardsPanelProps> = ({ cards, dueCount, onReview, onDelete, onClose }) => {
  const byTopic = useMemo(() => {
    const groups = new Map<string, StudyCard[]>();
    for (const card of cards) groups.set(card.topic, [...(groups.get(card.topic) ?? []), card]);
    return [...groups.entries()];
  }, [cards]);

  return (
    <Sheet title="Study cards" onClose={onClose}>
      {cards.length === 0 ? (
        <p className="text-sm opacity-70 text-center py-4">No study cards yet. Say "quiz me" and show BMO your notes. Questions you find tricky end up here.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={onReview}
            disabled={dueCount === 0}
            className="w-full rounded-2xl py-3 text-base font-bold text-white bg-[#2d4f9e] shadow disabled:opacity-50"
          >
            {dueCount ? `🎤 Practise ${Math.min(dueCount, 5)} tricky question${dueCount === 1 ? '' : 's'}` : 'Nothing due today 🎉'}
          </button>
          {byTopic.map(([topic, list]) => (
            <section key={topic} className="mt-4">
              <h3 className="text-sm font-bold mb-1">{topic}</h3>
              <ul className="divide-y rounded-xl bg-white border">
                {list.map(card => (
                  <li key={card.id} className="flex items-start gap-2 px-3 py-2">
                    <span className="flex-1 text-sm">
                      {card.q}
                      <span className="block text-[11px] opacity-60 mt-0.5">{progress(card)}</span>
                    </span>
                    <button type="button" onClick={() => onDelete(card.id)} aria-label={`Delete card: ${card.q}`} className="text-lg opacity-50 hover:opacity-100 px-1">✕</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Sheet>
  );
};
