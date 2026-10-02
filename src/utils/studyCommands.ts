// Understanding what the friend says while studying, on the device

const normalise = (text: string) => text.trim().replace(/^(hey |hi |ok |okay )?bmo[,!.]?\s*/i, '').replace(/[.!?]+$/, '').trim();

const NUMBER_WORDS: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty five': 25, 'twenty-five': 25, thirty: 30, forty: 40,
  'forty five': 45, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90
};

export const MIN_FOCUS_MINUTES = 5;
export const MAX_FOCUS_MINUTES = 120;

// "45 minutes", "for an hour", "half an hour", "twenty minutes" → minutes (null if none said)
export const parseMinutes = (text: string): number | null => {
  const said = normalise(text).toLowerCase();
  let minutes: number | null = null;
  if (/\bhalf an hour\b/.test(said)) minutes = 30;
  else if (/\b(an|one) hour and a half\b|\bhour and a half\b/.test(said)) minutes = 90;
  else if (/\b(an|one) hour\b/.test(said)) minutes = 60;
  else {
    const digits = /\b(\d{1,3})\s*(min|minutes?|mins?)?\b/.exec(said);
    if (digits) minutes = Number(digits[1]);
    else {
      const word = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).find(w => said.includes(w));
      if (word && /\bmin/.test(said)) minutes = NUMBER_WORDS[word];
    }
  }
  if (minutes === null) return null;
  return Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, minutes));
};

export type FocusCommand = 'howLong' | 'pause' | 'resume' | 'stop' | 'start';

export const parseFocusCommand = (text: string): FocusCommand | null => {
  const said = normalise(text);
  if (/\b(stop|end|quit|finish|done) (studying|focus(ing)?|study( mode)?)\b|\bi'?m done studying\b/i.test(said)) return 'stop';
  if (/\bhow (long|much time)\b|\btime left\b|\bminutes left\b/i.test(said)) return 'howLong';
  if (/\b(pause|hold on|wait a (sec|second|minute)|take a break)\b/i.test(said)) return 'pause';
  if (/\b(resume|keep going|carry on|continue|unpause)\b/i.test(said)) return 'resume';
  if (/^(yes|yeah|yep|ready|let'?s go|go|start|ok(ay)?|sure)\b/i.test(said)) return 'start';
  return null;
};

// "I don't know", "skip", "no idea" during a quiz
export const isDontKnow = (text: string): boolean =>
  /\b(i )?(don'?t|do not) know\b|\bno idea\b|\bskip\b|\bpass\b|\bi forgot\b|\bnot sure\b/i.test(normalise(text));

// Leaving a quiz or a lesson
export const isStopQuiz = (text: string): boolean =>
  /\b(stop|end|quit) (the )?(quiz|quizzing|questions)\b|\bno more questions\b/i.test(normalise(text));

export const isEndLesson = (text: string): boolean =>
  /\bclass (is )?(dismissed|over)\b|\b(lesson|class) (is )?over\b|\bthat'?s (all|it) for (today|now)\b|\bstop (teaching|the lesson)\b/i.test(normalise(text));

// Format seconds as m:ss for the countdown
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
