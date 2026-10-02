import { describe, expect, it } from 'vitest';
import { addMissed, dueCards, reviewCard, MAX_CARDS, StudyCard } from './studyCards';
import { formatClock, isDontKnow, isEndLesson, isStopQuiz, parseFocusCommand, parseMinutes } from './studyCommands';
import { detectPhrase } from './easterEggs';

const today = '2026-10-02';
const q = (n: number) => ({ q: `Question ${n}?`, answer: `Answer ${n}`, why: `Because ${n}` });

describe('study cards', () => {
  it('turns missed questions into cards that come back tomorrow', () => {
    const cards = addMissed([], [q(1)], 'Interest', today);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ topic: 'Interest', box: 1, due: '2026-10-03', mastered: false });
  });

  it('restarts a card that was missed again instead of duplicating it', () => {
    const first = addMissed([], [q(1)], 'Interest', today);
    const moved = [reviewCard(first[0], true, today)];
    const again = addMissed(moved, [{ ...q(1), q: 'question 1?' }], 'Interest', today);
    expect(again).toHaveLength(1);
    expect(again[0].box).toBe(1);
  });

  it('spaces right answers out: 2, 4, 7, then 14 days', () => {
    let card: StudyCard = addMissed([], [q(1)], 'x', today)[0];
    const dues: string[] = [];
    for (let i = 0; i < 4; i++) {
      card = reviewCard(card, true, today);
      dues.push(card.due);
    }
    expect(dues).toEqual(['2026-10-04', '2026-10-06', '2026-10-09', '2026-10-16']);
    expect(card.box).toBe(5);
    expect(reviewCard(card, true, today).mastered).toBe(true);
  });

  it('a wrong answer brings the card back tomorrow from the start', () => {
    const card = reviewCard({ ...addMissed([], [q(1)], 'x', today)[0], box: 4 }, false, today);
    expect(card).toMatchObject({ box: 1, due: '2026-10-03' });
  });

  it('asks only cards that are due and not mastered, most overdue first', () => {
    const cards = addMissed([], [q(1), q(2), q(3)], 'x', today).map((c, i) => ({ ...c, due: ['2026-10-01', '2026-10-05', '2026-09-30'][i] }));
    cards[0] = { ...cards[0], mastered: true };
    expect(dueCards(cards, today).map(c => c.q)).toEqual(['Question 3?']);
  });

  it('stays within its limit, dropping mastered cards first', () => {
    const many = addMissed([], Array.from({ length: MAX_CARDS }, (_, i) => q(i)), 'x', today);
    many[5] = { ...many[5], mastered: true };
    const more = addMissed(many, [q(9999)], 'x', today);
    expect(more).toHaveLength(MAX_CARDS);
    expect(more.some(c => c.q === 'Question 5?')).toBe(false);
  });
});

describe('study phrases', () => {
  it.each([
    ['study time', 'study'], ['BMO, help me focus', 'study'], ['quiz me!', 'quiz'],
    ['quiz my hard ones', 'hardOnes'], ['show my study cards', 'studyCards'], ['let me teach you about bonds', 'teach'],
  ])('"%s" → %s', (said, egg) => {
    expect(detectPhrase(said)).toBe(egg);
  });
});

describe('study commands', () => {
  it.each([
    ['45 minutes', 45], ["let's do 20 min", 20], ['for an hour', 60], ['half an hour', 30],
    ['twenty five minutes please', 25], ['3 minutes', 5], ['500 minutes', 120], ['hmm', null],
  ])('"%s" → %s minutes', (said, minutes) => {
    expect(parseMinutes(said)).toBe(minutes);
  });

  it.each([
    ['how long is left?', 'howLong'], ['pause', 'pause'], ['keep going', 'resume'],
    ['stop studying', 'stop'], ['yes!', 'start'], ['what is a bond', null],
  ])('"%s" → %s', (said, command) => {
    expect(parseFocusCommand(said)).toBe(command);
  });

  it('hears "I don\'t know", stopping a quiz and ending a lesson', () => {
    expect(isDontKnow("I don't know")).toBe(true);
    expect(isDontKnow('skip this one')).toBe(true);
    expect(isDontKnow('interest is money paid for borrowing')).toBe(false);
    expect(isStopQuiz('stop the quiz')).toBe(true);
    expect(isEndLesson('class dismissed!')).toBe(true);
  });

  it('formats the countdown', () => {
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(61.2)).toBe('1:02');
    expect(formatClock(-3)).toBe('0:00');
  });
});
