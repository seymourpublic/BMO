import React, { useRef } from 'react';
import { KitchenSession } from '../hooks/useKitchen';
import { CameraView, CapturedPhoto } from './CameraView';

export type KitchenCamera = 'recipe' | 'dish' | null;

interface KitchenScreenProps {
  session: KitchenSession;
  color: string;        // BMO's face colour (text)
  screenColor: string;  // BMO's screen colour (background)
  camera: KitchenCamera;
  speech: string | null;  // What BMO is saying right now (an answer, not a step), shown over the lists
  onToggleNeed: (index: number) => void;
  onStartCooking: () => void;
  onNext: () => void;
  onBack: () => void;
  onRate: (rating: number) => void;
  onOpenCamera: (camera: Exclude<KitchenCamera, null>) => void;
  onPickRecipe: (file: File) => void;
  onCapture: (photo: CapturedPhoto) => void;
  onCameraError: (message: string) => void;
  onSkipPhoto: () => void;
}

// A little chef's hat on top of BMO's screen while it's in the kitchen
const ChefHat: React.FC = () => (
  <svg viewBox="0 0 60 40" className="absolute top-[1%] left-1/2 -translate-x-1/2 w-[18%] pointer-events-none drop-shadow" aria-hidden="true">
    <path d="M12 26 C2 26 2 10 13 12 C14 2 30 0 32 9 C38 0 54 4 49 15 C60 16 57 30 47 27 L47 33 L13 33 Z" fill="#ffffff" stroke="#d6d6d6" strokeWidth="1.5" />
    <rect x="13" y="30" width="34" height="7" rx="1.5" fill="#ffffff" stroke="#d6d6d6" strokeWidth="1.5" />
  </svg>
);

const SmallButton: React.FC<{ onClick: () => void; label: string; children: React.ReactNode; primary?: boolean }> = ({ onClick, label, children, primary }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`rounded-full px-[4%] py-[1.5%] text-[clamp(11px,3.2vw,14px)] font-bold shadow active:translate-y-[1px] ${primary ? 'bg-[#43b649] text-white' : 'bg-white/90'}`}
  >
    {children}
  </button>
);

// What BMO's screen shows in kitchen mode. The face and caption stay visible while
// choosing, reading a recipe and talking about changes; lists and steps take over the screen.
export const KitchenScreen: React.FC<KitchenScreenProps> = ({
  session, color, screenColor, camera, speech, onToggleNeed, onStartCooking, onNext, onBack, onRate,
  onOpenCamera, onPickRecipe, onCapture, onCameraError, onSkipPhoto
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const recipe = session.recipe;

  if (camera) {
    return (
      <div className="absolute inset-0 z-10">
        <CameraView
          key={camera}
          facing="environment"
          shutter="button"
          reading={camera === 'recipe'}
          onCapture={onCapture}
          onError={onCameraError}
        />
        {camera === 'dish' && (
          <div className="absolute top-[3%] right-[3%]">
            <SmallButton onClick={onSkipPhoto} label="Skip the photo">Skip</SmallButton>
          </div>
        )}
      </div>
    );
  }

  const full = 'absolute inset-0 z-10 flex flex-col p-[4%] gap-[3%] text-[clamp(12px,3.4vw,15px)] leading-snug';
  // BMO's answer to a question floats over the list or step while BMO says it
  const bubble = speech && (
    <div className="absolute left-[4%] right-[4%] bottom-[22%] max-h-[55%] overflow-y-auto rounded-xl bg-white px-[4%] py-[3%] shadow-lg text-[0.95em] z-20" aria-live="polite">
      {speech}
    </div>
  );

  if (session.phase === 'shopping' && recipe) {
    return (
      <div className={full} style={{ background: screenColor, color }}>
        <div className="font-extrabold text-center truncate pt-[8%]">{recipe.title}</div>
        <div className="text-center text-[0.8em] opacity-80">Tap what you don't have</div>
        <ul className="flex-1 overflow-y-auto rounded-lg bg-white/70 px-[3%] py-[2%]">
          {recipe.ingredients.map((line, i) => {
            const needed = session.need.includes(i);
            return (
              <li key={i}>
                <button type="button" onClick={() => onToggleNeed(i)} className="w-full text-left py-[1%] flex gap-[3%]" aria-pressed={needed}>
                  <span aria-hidden="true">{needed ? '🛒' : '✓'}</span>
                  <span className={needed ? 'opacity-60' : ''}>{line}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-center">
          <SmallButton onClick={onStartCooking} label="Start cooking" primary>Start cooking ▶</SmallButton>
        </div>
        {bubble}
      </div>
    );
  }

  if (session.phase === 'cooking' && recipe) {
    const total = recipe.steps.length;
    return (
      <div className={full} style={{ background: screenColor, color }}>
        <div className="pt-[8%] flex items-center gap-[3%] text-[0.85em] font-bold">
          <span>Step {session.step + 1} of {total}</span>
          <span className="flex-1 h-[6px] rounded-full bg-white/60 overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${((session.step + 1) / total) * 100}%`, background: color }} />
          </span>
        </div>
        <div className="flex-1 overflow-y-auto rounded-lg bg-white/70 px-[4%] py-[3%] text-[1.1em] font-semibold" aria-live="polite">
          {recipe.steps[session.step]}
        </div>
        <div className="flex justify-between">
          <SmallButton onClick={onBack} label="Previous step">◀ Back</SmallButton>
          <SmallButton onClick={onNext} label={session.step + 1 === total ? 'Finished cooking' : 'Next step'} primary>
            {session.step + 1 === total ? 'Done! ✓' : 'Next ▶'}
          </SmallButton>
        </div>
        {bubble}
      </div>
    );
  }

  if (session.phase === 'rating') {
    return (
      <div className={`${full} items-center justify-center`} style={{ background: screenColor, color }}>
        <div className="font-extrabold">How did it taste?</div>
        <div className="flex gap-[1%]" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={session.rating === n}
              aria-label={`${n} heart${n > 1 ? 's' : ''}`}
              onClick={() => onRate(n)}
              className="text-[clamp(18px,5.5vw,28px)] leading-none active:scale-110 transition-transform"
            >
              {session.rating >= n ? '❤️' : '🤍'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Choosing, reading the recipe, the dish photo prompt, or talking about changes: BMO's face shows underneath
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <ChefHat />
      {session.phase === 'choose' && (
        <div className="absolute top-[3%] right-[3%] flex flex-col gap-[6px] pointer-events-auto">
          <SmallButton onClick={() => onOpenCamera('recipe')} label="Take a photo of a recipe">📷</SmallButton>
          <SmallButton onClick={() => fileRef.current?.click()} label="Choose a recipe screenshot">🖼️</SmallButton>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onPickRecipe(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {session.phase === 'photo' && (
        <div className="absolute top-[3%] right-[3%] flex flex-col gap-[6px] pointer-events-auto">
          <SmallButton onClick={() => onOpenCamera('dish')} label="Take a photo of your dish" primary>📷</SmallButton>
          <SmallButton onClick={onSkipPhoto} label="Skip the photo">Skip</SmallButton>
        </div>
      )}
    </div>
  );
};
