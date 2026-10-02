import React, { useRef } from 'react';
import { FocusState, QuizState } from '../hooks/useStudyCompanion';
import { CameraView, CapturedPhoto } from './CameraView';
import { formatClock } from '../utils/studyCommands';

const Button: React.FC<{ onClick: () => void; label: string; children: React.ReactNode; primary?: boolean }> = ({ onClick, label, children, primary }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`rounded-full px-[5%] py-[1.5%] text-[clamp(11px,3.2vw,14px)] font-bold shadow active:translate-y-[1px] ${primary ? 'bg-[#43b649] text-white' : 'bg-white/90'}`}
  >
    {children}
  </button>
);

interface StudyScreenProps {
  focus: FocusState;
  remainingSeconds: number;
  color: string;
  screenColor: string;
  onStart: () => void;  // Next round, when waiting
  speech: string | null;  // What BMO just said (whispers, break tips), shown small at the bottom
}

// BMO's words over a study screen while it's talking
const Bubble: React.FC<{ text: string }> = ({ text }) => (
  <div className="absolute left-[4%] right-[4%] bottom-[4%] max-h-[45%] overflow-y-auto rounded-xl bg-white px-[4%] py-[3%] shadow-lg text-[clamp(12px,3.3vw,14px)] leading-snug z-20 pointer-events-auto" aria-live="polite">
    {text}
  </div>
);

// Focus timer on BMO's screen: a calm countdown with a tiny book
export const StudyScreen: React.FC<StudyScreenProps> = ({ focus, remainingSeconds, color, screenColor, onStart, speech }) => {
  const total = focus.phase === 'break' ? null : focus.focusMinutes * 60;
  const progress = total && focus.phase === 'focus' ? 1 - remainingSeconds / total : 0;
  const label = focus.phase === 'focus' ? `Focus · round ${focus.round}`
    : focus.phase === 'break' ? 'Break time!'
    : focus.phase === 'paused' ? 'Paused'
    : `Round ${focus.round} done!`;
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[4%] pointer-events-none" style={{ background: screenColor, color }}>
      <span className="text-[clamp(26px,9vw,42px)] leading-none" aria-hidden="true">{focus.phase === 'break' ? '🧃' : '📖'}</span>
      <span className="text-[clamp(12px,3.4vw,15px)] font-bold">{label}</span>
      {focus.phase !== 'waiting' && (
        <span className="text-[clamp(30px,11vw,52px)] font-extrabold tabular-nums leading-none" role="timer" aria-live="off">
          {formatClock(remainingSeconds)}
        </span>
      )}
      {focus.phase === 'focus' && (
        <span className="w-[70%] h-[6px] rounded-full bg-white/60 overflow-hidden" aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${progress * 100}%`, background: color }} />
        </span>
      )}
      {focus.phase === 'waiting' && (
        <span className="pointer-events-auto"><Button onClick={onStart} label="Start the next round" primary>Start round {focus.round + 1} ▶</Button></span>
      )}
      {speech && <Bubble text={speech} />}
    </div>
  );
};

interface QuizScreenProps {
  quiz: QuizState;
  camera: boolean;
  color: string;
  screenColor: string;
  onOpenCamera: () => void;
  onPickNotes: (file: File) => void;
  onCapture: (photo: CapturedPhoto) => void;
  onCameraError: (message: string) => void;
  onSelfMark: (right: boolean) => void;
  speech: string | null;  // BMO's feedback on an answer, over the question while it's said
}

// The BMO Quiz Show on BMO's screen
export const QuizScreen: React.FC<QuizScreenProps> = ({
  quiz, camera, color, screenColor, onOpenCamera, onPickNotes, onCapture, onCameraError, onSelfMark, speech
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  if (camera) {
    return (
      <div className="absolute inset-0 z-10">
        <CameraView facing="environment" shutter="button" reading onCapture={onCapture} onError={onCameraError} />
      </div>
    );
  }

  // Waiting for notes (or reading them): BMO's face shows, with the camera and gallery buttons
  if (quiz.phase === 'notes' || quiz.phase === 'loading') {
    return (
      <div className="absolute inset-0 z-10 pointer-events-none">
        <span className="absolute top-[2%] left-1/2 -translate-x-1/2 text-[clamp(16px,5vw,24px)]" aria-hidden="true">🎤</span>
        {quiz.phase === 'notes' && (
          <div className="absolute top-[3%] right-[3%] flex flex-col gap-[6px] pointer-events-auto">
            <Button onClick={onOpenCamera} label="Take a photo of your notes">📷</Button>
            <Button onClick={() => fileRef.current?.click()} label="Choose a screenshot of your notes">🖼️</Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onPickNotes(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const question = quiz.questions[Math.min(quiz.index, quiz.questions.length - 1)];
  return (
    <div className="absolute inset-0 z-10 flex flex-col p-[4%] gap-[3%] text-[clamp(12px,3.4vw,15px)] leading-snug" style={{ background: screenColor, color }}>
      <div className="pt-[2%] flex items-center justify-between text-[0.85em] font-bold">
        <span className="truncate">🎤 {quiz.topic}</span>
        <span>{quiz.index + 1} / {quiz.questions.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-white/80 px-[4%] py-[3%] text-[1.1em] font-semibold" aria-live="polite">
        {question?.q}
        {quiz.phase === 'selfMark' && <p className="mt-2 text-[0.85em] font-normal"><b>Answer:</b> {question.answer}</p>}
      </div>
      {quiz.phase === 'selfMark' ? (
        <div className="flex justify-center gap-[4%]">
          <Button onClick={() => onSelfMark(true)} label="I got it" primary>✓ Got it</Button>
          <Button onClick={() => onSelfMark(false)} label="Not yet">✗ Not yet</Button>
        </div>
      ) : (
        <div className="text-center text-[0.8em] opacity-75">
          {quiz.phase === 'judging' ? 'BMO is checking…' : 'Say your answer, or type it. "Skip" is okay too!'}
        </div>
      )}
      {speech && <Bubble text={speech} />}
    </div>
  );
};
