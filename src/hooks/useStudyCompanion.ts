import { useCallback, useEffect, useRef, useState } from 'react';
import { Mood } from '../types';
import { CapturedPhoto } from '../components/CameraView';
import { Verdict, checkAnswer, fetchQuiz } from '../utils/api';
import { ImageError, blobToDataUrl, shrinkPageForReading } from '../utils/images';
import { FeatureId } from '../utils/growth';
import { localDate } from '../utils/memory';
import {
  QuizQuestion, StudyCard, StudyData, addMissed, clearStudy, dueCards, loadStudy, reviewCard, saveStudy
} from '../utils/studyCards';
import { formatClock, isDontKnow, isEndLesson, isStopQuiz, parseFocusCommand, parseMinutes } from '../utils/studyCommands';
import { soundEffects } from '../utils/sounds';

export type StudyMode = 'study' | 'quiz' | 'teach';

// --- Focus timer ---
export interface FocusState {
  phase: 'focus' | 'break' | 'waiting' | 'paused';
  endsAt: number;        // ms timestamp the current focus/break ends
  remainingMs: number;   // While paused
  pausedFrom?: 'focus' | 'break';
  round: number;
  focusMinutes: number;
}

const DEFAULT_FOCUS = 25;
const SHORT_BREAK = 5;
const LONG_BREAK = 15;
const ROUNDS_BEFORE_LONG_BREAK = 4;
const WHISPER_MS = 4000;
const BREAK_TIPS = [
  'Stretch your arms up high, like BMO!',
  'Drink some water, friend!',
  'Look out of a window for a little bit. Rest your eyes!',
  'Wiggle your toes! BMO is wiggling too.',
  'Take three big breaths with BMO. In… and out…'
];
const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

// --- Quiz ---
export interface QuizItem extends QuizQuestion {
  cardId?: string;       // Reviewing a saved study card
}

export interface QuizState {
  source: 'notes' | 'review';
  phase: 'notes' | 'loading' | 'asking' | 'judging' | 'selfMark' | 'done';
  topic: string;
  questions: QuizItem[];
  index: number;
  results: Verdict[];
}

const MAX_REVIEW = 5;
export const REVIEW_OFFER_MIN = 3;  // Due cards needed before BMO offers a review on waking

interface Options {
  quickLine: (text: string, mood: Mood, spoken: boolean) => Promise<void>;
  ask: (text: string) => void;
  setMood: (mood: Mood) => void;
  setCaption: (text: string) => void;
  enterMode: (mode: StudyMode) => void;
  exitMode: () => void;
  interrupt: () => void;
  firstUse: (id: FeatureId) => string | null;
}

// Keep the screen on during focus rounds, where the phone allows it
type WakeLock = { release: () => Promise<void> };
const requestWakeLock = async (): Promise<WakeLock | null> => {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } };
    return (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    return null;
  }
};

export const useStudyCompanion = (o: Options) => {
  const opts = useRef(o);
  opts.current = o;
  const [mode, setStudyMode] = useState<StudyMode | null>(null);
  const [focus, setFocusState] = useState<FocusState | null>(null);
  const [quiz, setQuizState] = useState<QuizState | null>(null);
  const [camera, setCamera] = useState(false);
  const [data, setData] = useState<StudyData>(loadStudy);
  const [now, setNow] = useState(Date.now());
  const [whisperUntil, setWhisperUntil] = useState(0);  // A silent whisper stays on screen until then
  const focusRef = useRef(focus);
  const quizRef = useRef(quiz);
  const wakeLockRef = useRef<WakeLock | null>(null);

  const setFocus = useCallback((next: FocusState | null) => { focusRef.current = next; setFocusState(next); }, []);
  const setQuiz = useCallback((next: QuizState | null) => { quizRef.current = next; setQuizState(next); }, []);

  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => saveStudy(data), [data]);

  // --- Focus timer ---
  const holdScreenOn = useCallback(async (on: boolean) => {
    if (on && !wakeLockRef.current) wakeLockRef.current = await requestWakeLock();
    if (!on && wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const startRound = useCallback((round: number, focusMinutes: number) => {
    setFocus({ phase: 'focus', endsAt: Date.now() + focusMinutes * 60_000, remainingMs: 0, round, focusMinutes });
    holdScreenOn(true);
  }, [setFocus, holdScreenOn]);

  // Tick once a second while the timer runs (based on real time, so it catches up after the phone sleeps)
  const timing = focus && (focus.phase === 'focus' || focus.phase === 'break');
  useEffect(() => {
    if (!timing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timing]);

  // Phones release the screen lock when the app is hidden: take it again on return
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && focusRef.current?.phase === 'focus') {
        wakeLockRef.current = null;
        holdScreenOn(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [holdScreenOn]);

  // Rounds and breaks ending
  useEffect(() => {
    const f = focusRef.current;
    if (!f || now < f.endsAt) return;
    const { quickLine } = opts.current;
    if (f.phase === 'focus') {
      setData(d => ({ ...d, focusMinutes: d.focusMinutes + f.focusMinutes }));
      const long = f.round % ROUNDS_BEFORE_LONG_BREAK === 0;
      const breakMinutes = long ? LONG_BREAK : SHORT_BREAK;
      setFocus({ ...f, phase: 'break', endsAt: Date.now() + breakMinutes * 60_000 });
      holdScreenOn(false);
      soundEffects.playSparkle();
      quickLine(`Round ${f.round} done! BMO is so proud! ${breakMinutes}-minute break. ${pickRandom(BREAK_TIPS)}`, 'excited', true);
    } else if (f.phase === 'break') {
      setFocus({ ...f, phase: 'waiting' });
      soundEffects.playSparkle();
      quickLine(`Break's over! Ready for round ${f.round + 1}? Tap start, or press the red button and say "ready".`, 'happy', true);
    }
  }, [now, setFocus, holdScreenOn]);

  const remainingSeconds = (f: FocusState | null) =>
    !f ? 0 : f.phase === 'paused' ? f.remainingMs / 1000 : Math.max(0, (f.endsAt - Date.now()) / 1000);

  const startStudy = useCallback((text: string) => {
    const { interrupt, enterMode, firstUse, quickLine } = opts.current;
    interrupt();
    setQuiz(null);
    setStudyMode('study');
    enterMode('study');
    const minutes = parseMinutes(text) ?? DEFAULT_FOCUS;
    const surprise = firstUse('study');
    startRound(1, minutes);
    quickLine(`${surprise ? `${surprise} ` : ''}Okay! ${minutes} minutes of focus. BMO will be super quiet. You've got this!`, 'happy', true);
  }, [setQuiz, startRound]);

  // Tapping BMO during focus: a whisper with the time left
  const whisper = useCallback(() => {
    const f = focusRef.current;
    if (!f) return;
    const left = formatClock(remainingSeconds(f));
    const text = f.phase === 'focus' ? `Shh… we're focusing! ${left} left.`
      : f.phase === 'break' ? `It's break time! ${left} left. ${pickRandom(BREAK_TIPS)}`
      : f.phase === 'paused' ? 'We\'re paused. Say "keep going" when you\'re ready!'
      : `Ready for round ${f.round + 1}? Tap start!`;
    setWhisperUntil(Date.now() + WHISPER_MS);
    opts.current.quickLine(text, 'happy', f.phase !== 'focus');  // During focus BMO only whispers on screen
  }, []);

  const nextRound = useCallback(() => {
    const f = focusRef.current;
    if (!f) return;
    startRound(f.round + 1, f.focusMinutes);
    opts.current.quickLine(`Round ${f.round + 1}! Let's go, friend!`, 'excited', true);
  }, [startRound]);

  const pauseFocus = useCallback(() => {
    const f = focusRef.current;
    if (!f || (f.phase !== 'focus' && f.phase !== 'break')) return;
    setFocus({ ...f, phase: 'paused', pausedFrom: f.phase, remainingMs: Math.max(0, f.endsAt - Date.now()) });
    holdScreenOn(false);
    opts.current.quickLine('Paused! Say "keep going" when you\'re ready.', 'happy', true);
  }, [setFocus, holdScreenOn]);

  const resumeFocus = useCallback(() => {
    const f = focusRef.current;
    if (!f || f.phase !== 'paused') return;
    const phase = f.pausedFrom ?? 'focus';
    setFocus({ ...f, phase, endsAt: Date.now() + f.remainingMs });
    if (phase === 'focus') holdScreenOn(true);
    opts.current.quickLine('Back to it! BMO believes in you!', 'happy', true);
  }, [setFocus, holdScreenOn]);

  // --- Quiz ---
  const askQuestion = useCallback((state: QuizState) => {
    const question = state.questions[state.index];
    opts.current.interrupt();
    opts.current.quickLine(`Question ${state.index + 1}. ${question.q}`, 'thinking', true);
  }, []);

  const startQuiz = useCallback(() => {
    const { interrupt, enterMode, firstUse, quickLine } = opts.current;
    interrupt();
    setFocus(null);
    holdScreenOn(false);
    setStudyMode('quiz');
    enterMode('quiz');
    setQuiz({ source: 'notes', phase: 'notes', topic: '', questions: [], index: 0, results: [] });
    const surprise = firstUse('quiz');
    quickLine(`${surprise ? `${surprise} ` : ''}Show BMO your notes! Take a photo, or pick a screenshot.`, 'excited', true);
  }, [setFocus, setQuiz, holdScreenOn]);

  const quizFromImage = useCallback(async (image: string) => {
    const { setMood, setCaption, quickLine } = opts.current;
    const current = quizRef.current;
    if (!current) return;
    setQuiz({ ...current, phase: 'loading' });
    setMood('thinking');
    setCaption('BMO is reading your notes…');
    try {
      const made = await fetchQuiz(image);
      if (!quizRef.current) return;  // Left meanwhile
      if (!made) {
        setQuiz({ ...current, phase: 'notes' });
        quickLine("BMO can't read those notes… try a closer photo, with good light?", 'confused', true);
        return;
      }
      const state: QuizState = { source: 'notes', phase: 'asking', topic: made.topic, questions: made.questions, index: 0, results: [] };
      setQuiz(state);
      await quickLine(`Welcome to the BMO Quiz Show! Today's topic: ${made.topic}. ${made.questions.length} questions!`, 'excited', true);
      if (quizRef.current === state) askQuestion(state);
    } catch (error) {
      if (!quizRef.current) return;
      setQuiz({ ...current, phase: 'notes' });
      quickLine(error instanceof Error && error.message ? error.message : "BMO's quiz brain got confused. Try again?", 'confused', true);
    }
  }, [setQuiz, askQuestion]);

  const startReview = useCallback(() => {
    const { interrupt, enterMode, quickLine } = opts.current;
    const due = dueCards(data.cards, localDate()).slice(0, MAX_REVIEW);
    if (due.length === 0) {
      quickLine('No tricky questions today! BMO is so proud of you!', 'excited', true);
      return;
    }
    interrupt();
    setFocus(null);
    setStudyMode('quiz');
    enterMode('quiz');
    const state: QuizState = {
      source: 'review', phase: 'asking', topic: 'Tricky questions', index: 0, results: [],
      questions: due.map(c => ({ q: c.q, answer: c.answer, why: c.why, cardId: c.id }))
    };
    setQuiz(state);
    quickLine(`Let's practise ${due.length} tricky question${due.length === 1 ? '' : 's'}!`, 'excited', true)
      .then(() => { if (quizRef.current === state) askQuestion(state); });
  }, [data.cards, setFocus, setQuiz, askQuestion]);

  const finishQuiz = useCallback((state: QuizState) => {
    const { quickLine, exitMode } = opts.current;
    const today = localDate();
    const asked = state.questions.slice(0, state.results.length);
    const right = state.results.filter(r => r === 'right').length;
    const missed = asked.filter((_, i) => state.results[i] !== 'right');
    const current = dataRef.current;
    let mastered = 0;
    const cards = state.source === 'notes'
      ? addMissed(current.cards, missed, state.topic, today)
      : current.cards.map(card => {
        const i = asked.findIndex(q => q.cardId === card.id);
        if (i < 0) return card;
        const reviewed = reviewCard(card, state.results[i] === 'right', today);
        if (reviewed.mastered && !card.mastered) mastered++;
        return reviewed;
      });
    setData({ ...current, cards });
    setQuiz(null);
    setStudyMode(null);
    exitMode();
    const total = asked.length;
    const praise = right === total ? 'PERFECT! BMO is doing a happy dance!' : right >= total / 2 ? 'Great job, friend!' : 'Every question makes your brain stronger!';
    const saved = state.source === 'notes' && missed.length ? ` BMO saved ${missed.length} tricky one${missed.length === 1 ? '' : 's'} to practise later.` : '';
    const extra = mastered ? ` And you mastered ${mastered} card${mastered === 1 ? '' : 's'}! You've GOT it!` : '';
    if (total === 0) quickLine('Quiz show over! Thanks for playing, friend!', 'happy', true);
    else quickLine(`${right} out of ${total}! ${praise}${saved}${extra}`, right === total ? 'starry' : 'excited', true);
  }, [setQuiz]);

  // Record the verdict straight away (so stopping mid-feedback still saves it)...
  const record = useCallback((state: QuizState, verdict: Verdict): QuizState => {
    const recorded = { ...state, results: [...state.results.slice(0, state.index), verdict], phase: 'judging' as const };
    setQuiz(recorded);
    return recorded;
  }, [setQuiz]);

  // ...then move on to the next question once BMO has said its piece
  const advance = useCallback((state: QuizState) => {
    const next = { ...state, index: state.index + 1, phase: 'asking' as const };
    if (next.index >= state.questions.length) {
      finishQuiz(next);
      return;
    }
    setQuiz(next);
    askQuestion(next);
  }, [finishQuiz, setQuiz, askQuestion]);

  const answer = useCallback(async (text: string) => {
    const state = quizRef.current;
    if (!state) return;
    const { quickLine, setMood, setCaption } = opts.current;
    const question = state.questions[state.index];
    if (isStopQuiz(text)) {
      finishQuiz(state);
      return;
    }
    const answerText = question.answer.replace(/[.!?]+$/, '');
    if (isDontKnow(text)) {
      const recorded = record(state, 'notYet');
      await quickLine(`That's okay! The answer is: ${answerText}. ${question.why}`, 'happy', true);
      if (quizRef.current?.index === state.index) advance(recorded);
      return;
    }
    setQuiz({ ...state, phase: 'judging' });
    setMood('thinking');
    setCaption('Hmm… BMO is checking…');
    const result = await checkAnswer(question, text);
    if (quizRef.current?.index !== state.index) return;  // Left or moved on meanwhile
    if (!result) {
      // BMO couldn't judge it: show the answer and let the friend mark it
      setQuiz({ ...state, phase: 'selfMark' });
      quickLine(`The answer is: ${answerText}. Did you get it?`, 'happy', true);
      return;
    }
    const recorded = record(state, result.verdict);
    if (result.verdict === 'right') soundEffects.playEmote('excited');
    await quickLine(result.reply, result.verdict === 'right' ? 'excited' : 'happy', true);
    if (quizRef.current?.index === state.index) advance(recorded);
  }, [finishQuiz, setQuiz, record, advance]);

  const selfMark = useCallback((right: boolean) => {
    const state = quizRef.current;
    if (state?.phase === 'selfMark') advance(record(state, right ? 'right' : 'notYet'));
  }, [record, advance]);

  const onCapture = useCallback(async (photo: CapturedPhoto) => {
    setCamera(false);
    await quizFromImage(await blobToDataUrl(photo.forReading ?? photo.forAi));
  }, [quizFromImage]);

  const onPickNotes = useCallback(async (file: File) => {
    try {
      await quizFromImage(await blobToDataUrl(await shrinkPageForReading(file)));
    } catch (error) {
      opts.current.quickLine(error instanceof ImageError ? error.message : "BMO couldn't open that picture. Try a different one?", 'confused', true);
    }
  }, [quizFromImage]);

  const onCameraError = useCallback((message: string) => {
    setCamera(false);
    opts.current.quickLine(message, 'confused', true);
  }, []);

  // --- Teach BMO ---
  const startTeach = useCallback((text: string) => {
    const { interrupt, enterMode, firstUse, quickLine, ask } = opts.current;
    interrupt();
    setFocus(null);
    setQuiz(null);
    setStudyMode('teach');
    enterMode('teach');
    const surprise = firstUse('teach');
    // "Let me teach you about bonds": BMO starts asking right away
    if (/\babout\b/i.test(text)) {
      if (surprise) quickLine(surprise, 'excited', true).then(() => ask(text));
      else ask(text);
    } else {
      quickLine(`${surprise ? `${surprise} ` : 'Yay! BMO loves school! '}What are you going to teach BMO today?`, 'excited', true);
    }
  }, [setFocus, setQuiz]);

  // --- Leaving (red button, "stop studying", "class dismissed") ---
  const leave = useCallback((announce = true) => {
    const { quickLine, exitMode } = opts.current;
    const was = mode;
    const f = focusRef.current;
    setFocus(null);
    setQuiz(null);
    setCamera(false);
    setStudyMode(null);
    holdScreenOn(false);
    exitMode();
    if (!announce) return;
    if (was === 'study') {
      // Rounds finished: the current one only counts once its focus time is over
      const inFocus = f?.phase === 'focus' || (f?.phase === 'paused' && f.pausedFrom === 'focus');
      const rounds = f ? (inFocus ? f.round - 1 : f.round) : 0;
      quickLine(rounds > 0 ? `Great studying, friend! ${rounds} round${rounds === 1 ? '' : 's'} done. BMO is so proud!` : 'Okay! Study time is over. BMO is proud of you for trying!', 'love', true);
    } else if (was === 'teach') quickLine('Class dismissed! BMO learned so much. Thank you, teacher!', 'love', true);
    else if (was === 'quiz') quickLine('Quiz show over! Thanks for playing, friend!', 'happy', true);
  }, [mode, setFocus, setQuiz, holdScreenOn]);

  // Everything the friend says or types in a study mode
  const handleInput = useCallback((text: string) => {
    const { ask, quickLine } = opts.current;
    if (mode === 'teach') {
      if (isEndLesson(text)) leave();
      else ask(text);
      return;
    }
    if (mode === 'quiz') {
      const state = quizRef.current;
      if (!state || isStopQuiz(text)) {
        if (state && state.results.length) finishQuiz(state);
        else leave();
        return;
      }
      if (state.phase === 'asking') answer(text);
      else if (state.phase === 'selfMark') selfMark(/\b(yes|yeah|yep|got it|i did|right)\b/i.test(text));
      else if (state.phase === 'notes') quickLine('Show BMO your notes with the camera, or pick a screenshot!', 'happy', true);
      return;
    }
    if (mode === 'study') {
      const command = parseFocusCommand(text);
      const f = focusRef.current;
      if (command === 'stop') leave();
      else if (command === 'howLong' || !f) whisper();
      else if (command === 'pause') pauseFocus();
      else if (command === 'resume') resumeFocus();
      else if (f.phase === 'waiting' && command === 'start') nextRound();
      else if (f.phase === 'break') ask(text);  // Chatty again during breaks
      else quickLine('Shh… focus time! Ask BMO on your break.', 'happy', false);
    }
  }, [mode, leave, finishQuiz, answer, selfMark, whisper, pauseFocus, resumeFocus, nextRound]);

  // How many saved cards are due today (for the offer on waking)
  const dueCount = useCallback(() => dueCards(data.cards, localDate()).length, [data.cards]);

  const deleteCard = useCallback((id: string) => setData(d => ({ ...d, cards: d.cards.filter(c => c.id !== id) })), []);

  const forget = useCallback(() => {
    clearStudy();
    setData({ cards: [], focusMinutes: 0 });
  }, []);

  return {
    mode, focus, quiz, camera, setCamera, cards: data.cards as StudyCard[], now, whisperUntil,
    remaining: () => remainingSeconds(focusRef.current),
    startStudy, nextRound, whisper, startQuiz, startReview, startTeach, leave, handleInput,
    selfMark, onCapture, onPickNotes, onCameraError, dueCount, deleteCard, forget
  };
};
