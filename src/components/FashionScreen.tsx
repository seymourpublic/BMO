import React, { useEffect, useMemo } from 'react';
import { CameraView, CapturedPhoto } from './CameraView';
import { CHECK_COUNTDOWN, Look, RUNWAY_COUNTDOWN } from '../utils/fashion';

export interface FashionShow {
  style: 'runway' | 'check';
  phase: 'ready' | 'camera' | 'judging' | 'result' | 'finale';
  looks: Look[];
  judgingPhoto?: Blob;  // The photo being judged right now
  winner?: number;      // Index of the Look of the Night
}

interface FashionScreenProps {
  show: FashionShow;
  color: string;
  screenColor: string;  // Solid base under the stage lights, so BMO's caption doesn't show through
  speech: string | null;
  onTakeLook: () => void;
  onCapture: (photo: CapturedPhoto) => void;
  onCameraError: (message: string) => void;
}

// The BMO Fashion Show on BMO's screen: stage lights, the camera, and each look as a polaroid
export const FashionScreen: React.FC<FashionScreenProps> = ({ show, color, screenColor, speech, onTakeLook, onCapture, onCameraError }) => {
  const photo = show.phase === 'finale' && show.winner !== undefined ? show.looks[show.winner]?.photo
    : show.phase === 'judging' ? show.judgingPhoto
    : show.phase === 'result' ? show.looks[show.looks.length - 1]?.photo
    : undefined;
  const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  if (show.phase === 'camera') {
    return (
      <div className="absolute inset-0 z-10">
        <CameraView countdownFrom={show.style === 'runway' ? RUNWAY_COUNTDOWN : CHECK_COUNTDOWN} onCapture={onCapture} onError={onCameraError} />
      </div>
    );
  }

  const banner = show.phase === 'judging' ? 'The judges are deciding…'
    : show.phase === 'finale' && show.winner !== undefined ? `👑 Look of the Night: ${show.looks[show.winner]?.award}`
    : show.phase === 'result' ? `🏆 ${show.looks[show.looks.length - 1]?.award}`
    : null;

  return (
    <div className="absolute inset-0 z-10 bmo-stage flex flex-col items-center justify-center gap-[3%] p-[4%]" style={{ color, backgroundColor: screenColor }}>
      {show.phase === 'ready' ? (
        <>
          <span className="text-[clamp(12px,3.4vw,15px)] font-extrabold">✨ BMO Fashion Show ✨</span>
          <span className="text-[clamp(11px,3vw,13px)] opacity-80">Look {show.looks.length + 1}</span>
          <button
            type="button"
            onClick={onTakeLook}
            className="rounded-full px-[6%] py-[2%] text-[clamp(12px,3.4vw,15px)] font-bold text-white bg-[#e43d3d] shadow active:translate-y-[1px]"
          >
            📸 Strike a pose!
          </button>
        </>
      ) : (
        <>
          {url && <img src={url} alt="Your look" className="bmo-screen-photo max-h-[62%] object-contain bg-white p-[2.5%] pb-[5%] rounded shadow-md" />}
          {banner && (
            <span className="rounded-full bg-white/85 px-[4%] py-[1%] text-[clamp(11px,3.2vw,14px)] font-extrabold text-center">{banner}</span>
          )}
        </>
      )}
      {speech && (
        <div className="absolute left-[4%] right-[4%] bottom-[4%] max-h-[40%] overflow-y-auto rounded-xl bg-white px-[4%] py-[3%] shadow-lg text-[clamp(12px,3.3vw,14px)] leading-snug z-20" aria-live="polite">
          {speech}
        </div>
      )}
    </div>
  );
};
