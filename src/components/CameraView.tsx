import React, { useEffect, useRef, useState } from 'react';
import { AI_MAX_SIDE, AI_QUALITY, ALBUM_MAX_SIDE, ALBUM_QUALITY, drawForReading, drawToJpeg } from '../utils/images';
import { soundEffects } from '../utils/sounds';

export interface CapturedPhoto {
  album: Blob;  // Kept on the device (if the settings allow)
  forAi: Blob;  // Small copy BMO looks at
  forReading?: Blob;  // Sharper copy for reading text (recipes, notes), when asked for
}

interface CameraViewProps {
  onCapture: (photo: CapturedPhoto) => void;
  onError: (message: string) => void;
  facing?: 'user' | 'environment';  // Selfie camera (default, mirrored) or the back camera
  shutter?: 'countdown' | 'button'; // 3-2-1, or a shutter button to press (for pages and dishes)
  reading?: boolean;                // Also make a readable copy of text in the photo
  countdownFrom?: number;           // Seconds of countdown (5 gives time to step back and pose)
}

const SETTLE_MS = 700;    // Let the camera adjust its exposure before counting
const COUNT_STEP_MS = 800;
const FLASH_MS = 350;
const FRAME_TIMEOUT_MS = 5000;  // Give up if the camera never sends a picture

const cameraErrorMessage = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'BMO needs permission to use the camera!';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return "BMO can't find a camera.";
  if (name === 'NotReadableError') return 'Another app is using the camera right now.';
  return "BMO's camera isn't working. *sniffles*";
};

// BMO is camera! The viewfinder fills BMO's screen (mirrored for selfies),
// then 3… 2… 1… (or the shutter button) and flash. The camera turns off the moment the picture is taken.
export const CameraView: React.FC<CameraViewProps> = ({ onCapture, onError, facing = 'user', shutter = 'countdown', reading = false, countdownFrom = 3 }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [ready, setReady] = useState(false);  // Frames are arriving (shutter button can be pressed)
  const callbacks = useRef({ onCapture, onError });
  callbacks.current = { onCapture, onError };
  const captureRef = useRef<() => void>(() => {});
  const mirror = facing === 'user';

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const stopCamera = () => stream?.getTracks().forEach(track => track.stop());

    const capture = async () => {
      const video = videoRef.current;
      if (!video || cancelled) return;
      soundEffects.playShutter();
      setFlash(true);
      try {
        const album = await drawToJpeg(video, ALBUM_MAX_SIDE, ALBUM_QUALITY, mirror);
        const forAi = await drawToJpeg(video, AI_MAX_SIDE, AI_QUALITY, mirror);
        const forReading = reading ? await drawForReading(video) : undefined;
        stopCamera();
        if (!cancelled) later(() => callbacks.current.onCapture({ album, forAi, forReading }), FLASH_MS);
      } catch (error) {
        stopCamera();
        if (!cancelled) callbacks.current.onError(error instanceof Error ? error.message : cameraErrorMessage(error));
      }
    };

    let taken = false;
    captureRef.current = () => {
      if (taken) return;
      taken = true;
      capture();
    };

    const countDown = (n: number) => {
      if (cancelled) return;
      if (n === 0) {
        setCount(null);
        capture();
        return;
      }
      setCount(n);
      soundEffects.playCountdown(n === 1);
      later(() => countDown(n - 1), COUNT_STEP_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.current.onError("BMO can't find a camera.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false
        });
      } catch (error) {
        if (!cancelled) callbacks.current.onError(cameraErrorMessage(error));
        return;
      }
      if (cancelled) {
        stopCamera();
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      // Don't wait on play(): in a background tab it can stay pending. Wait for real frames instead.
      video.play().catch(() => {});
      const started = Date.now();
      const waitForFrames = () => {
        if (cancelled) return;
        if (video.videoWidth > 0) {
          setReady(true);
          if (shutter === 'countdown') later(() => countDown(countdownFrom), SETTLE_MS);
        }
        else if (Date.now() - started > FRAME_TIMEOUT_MS) {
          stopCamera();
          callbacks.current.onError("BMO's camera isn't working. *sniffles*");
        } else later(waitForFrames, 100);
      };
      waitForFrames();
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      stopCamera();
    };
    // Options are fixed for the life of the viewfinder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${mirror ? '-scale-x-100' : ''}`}
        playsInline
        muted
        autoPlay
        aria-label="BMO's camera"
      />
      {count !== null && (
        <span key={count} className="bmo-countdown absolute inset-0 flex items-center justify-center text-white text-[clamp(48px,18vw,96px)] font-extrabold drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]">
          {count}
        </span>
      )}
      {shutter === 'button' && ready && !flash && (
        <button
          type="button"
          onClick={() => captureRef.current()}
          aria-label="Take the picture"
          className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[18%] aspect-square rounded-full bg-white border-4 border-white/60 shadow-lg active:scale-95"
          style={{ boxShadow: '0 0 0 3px rgba(0,0,0,0.35)' }}
        />
      )}
      {flash && <div className="bmo-camera-flash absolute inset-0 bg-white" aria-hidden="true" />}
    </div>
  );
};
