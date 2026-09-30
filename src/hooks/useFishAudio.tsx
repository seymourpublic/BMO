import { useState, useRef, useCallback } from 'react';

interface UseFishAudioOutput {
  // Say one line. Resolves when BMO finishes talking (or is stopped); rejects if audio fails or is blocked
  speak: (text: string) => Promise<void>;
  // Streamed speech: start a queue, add sentences as they arrive, then end it.
  // endQueue() resolves when everything has been said (rejects with the first error).
  startQueue: () => void;
  enqueue: (text: string) => void;
  endQueue: () => Promise<void>;
  isSpeaking: boolean;
  stop: () => void;
  isSupported: boolean;
  error: string | null;
  prewarmAudio: () => void;  // Prewarm audio for iOS - call during user interaction
  // Current voice loudness 0-1 for mouth flaps; -1 if it can't be measured (use a fallback)
  getMouthLevel: () => number;
  // How far through everything queued BMO has spoken, 0-1
  getProgress: () => number;
}

interface SpeechQueue {
  id: number;
  clips: Array<{ text: string; audio: Promise<Blob> | null }>;
  next: number;            // Index of the clip playing or about to play
  ended: boolean;          // No more text is coming
  wake: (() => void) | null;  // Wakes the player when text arrives
  totalChars: number;
  doneChars: number;
  currentChars: number;
  firstError: Error | null;
  done: Promise<void>;
}

// How many clips to voice ahead of the one playing
const PREFETCH_AHEAD = 2;

// Clip watchdog: how often to check, how many paused checks mean "stuck",
// and how long past its length a clip may run before we move on
const WATCHDOG_INTERVAL_MS = 500;
const STUCK_CHECKS = 3;
const CLIP_GRACE_MS = 3000;
const MAX_CLIP_SECONDS = 60;  // Used when the clip length isn't known

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// speak() rejects with this message when the browser blocks playback (needs a tap)
export const PLAYBACK_BLOCKED = 'Failed to play audio';

// Friendly message for a failed <audio> element, or null if it was aborted on purpose
const describeMediaError = (audio: HTMLAudioElement): string | null => {
  switch (audio.error?.code) {
    case 1: return null; // MEDIA_ERR_ABORTED - user stopped it
    case 2: return 'Network error loading audio';
    case 3: return 'Audio decoding error';
    case 4: return 'Audio format not supported';
    default: return 'Failed to play audio';
  }
};

export const useFishAudio = (): UseFishAudioOutput => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);  // Pool for iOS
  // Ends the clip that's playing (used by stop())
  const finishRef = useRef<(() => void) | null>(null);
  // The current speech queue; the id changes on every start/stop so old queues stop themselves
  const queueRef = useRef<SpeechQueue | null>(null);
  const queueIdRef = useRef(0);

  // Loudness measurement for mouth flaps. An element connected to the audio
  // context plays *through* it, so we only connect while the context is running.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourcesRef = useRef(new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>());
  const levelBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const measuringRef = useRef(false);  // Is the current clip going through the analyser?

  const setUpAnalyser = () => {
    if (audioCtxRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      levelBufferRef.current = new Uint8Array(analyser.fftSize);
    } catch (err) {
      console.warn('Mouth-flap analyser unavailable, using timer fallback:', err);
    }
  };

  // Route an element through the analyser if possible. Returns whether it's measured.
  const connectAnalyser = (audio: HTMLAudioElement): boolean => {
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return false;
    if (sourcesRef.current.has(audio)) return ctx.state === 'running';
    if (ctx.state !== 'running') return false;
    try {
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      sourcesRef.current.set(audio, source);
      return true;
    } catch (err) {
      console.warn('Could not measure voice for mouth flaps:', err);
      return false;
    }
  };

  const getMouthLevel = useCallback((): number => {
    if (!audioRef.current) return 0;
    const analyser = analyserRef.current;
    const buffer = levelBufferRef.current;
    if (!measuringRef.current || !analyser || !buffer) return -1;
    analyser.getByteTimeDomainData(buffer);
    // Root-mean-square loudness, scaled so normal speech spans roughly 0-1
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
  }, []);

  // Prewarm audio elements (MUST call during user interaction!)
  // iOS allows these to play later because they were created during a gesture
  const prewarmAudio = useCallback(() => {
    setUpAnalyser();
    audioCtxRef.current?.resume().catch(() => {});
    for (let i = 0; i < 3; i++) {
      const audio = new Audio();
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audioPoolRef.current.push(audio);
    }
    console.log(`✅ ${audioPoolRef.current.length} audio elements ready`);
  }, []);

  // --- Speech queue: sentences are voiced ahead and played back to back ---

  // Ask the backend to voice one piece of text
  const fetchClip = (text: string): Promise<Blob> =>
    fetch(`${API_BASE_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).then(async response => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Backend TTS error: ${response.status}`);
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Received empty audio from backend');
      return blob;
    });

  // Start voicing the next few clips so there's no gap between sentences
  const prefetch = (queue: SpeechQueue) => {
    for (let i = queue.next; i < Math.min(queue.clips.length, queue.next + PREFETCH_AHEAD + 1); i++) {
      const clip = queue.clips[i];
      if (!clip.audio) {
        clip.audio = fetchClip(clip.text);
        clip.audio.catch(() => {});  // Handled when the clip's turn comes
      }
    }
  };

  // Play one clip on the queue's audio element; resolves when it ends (or is stopped)
  const playClip = async (audio: HTMLAudioElement, blob: Blob): Promise<void> => {
    const audioUrl = URL.createObjectURL(blob);
    audio.src = audioUrl;
    audioRef.current = audio;
    audio.load();  // iOS requires explicit load
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }
    measuringRef.current = connectAnalyser(audio);

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let stuckChecks = 0;
        const startedAt = performance.now();
        // Safety net: if "ended" never arrives (e.g. iOS pauses audio for a call),
        // treat the clip as finished instead of leaving BMO stuck mid-sentence.
        const watchdog = window.setInterval(() => {
          const expectedMs = (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : MAX_CLIP_SECONDS) * 1000;
          stuckChecks = audio.paused && audio.currentTime > 0 ? stuckChecks + 1 : 0;
          if (audio.ended || stuckChecks >= STUCK_CHECKS || performance.now() - startedAt > expectedMs + CLIP_GRACE_MS) {
            console.warn('Voice clip stopped without finishing; moving on');
            settle();
          }
        }, WATCHDOG_INTERVAL_MS);
        const settle = (err?: Error) => {
          if (settled) return;
          settled = true;
          clearInterval(watchdog);
          finishRef.current = null;
          audio.onended = null;
          audio.onerror = null;
          if (err) reject(err); else resolve();
        };
        finishRef.current = () => settle();  // stop() ends the clip early

        audio.onended = () => settle();
        audio.onerror = () => {
          const message = describeMediaError(audio);
          settle(message ? new Error(message) : undefined);
        };
        audio.play().catch((playError) => {
          console.error('Play error (iOS might block):', playError);
          settle(new Error(PLAYBACK_BLOCKED));
        });
      });
    } finally {
      URL.revokeObjectURL(audioUrl);
    }
  };

  // Play clips in order until the queue is ended (or stopped). Rejects with the first error.
  const runQueue = async (queue: SpeechQueue): Promise<void> => {
    // One element for the whole queue: once it has played, iOS lets it keep playing
    const audio = audioPoolRef.current.pop() ?? new Audio();
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    const isCurrent = () => queue.id === queueIdRef.current;

    try {
      while (isCurrent()) {
        if (queue.next >= queue.clips.length) {
          if (queue.ended) break;
          await new Promise<void>(resolve => { queue.wake = resolve; });  // Wait for more text
          continue;
        }
        prefetch(queue);
        const clip = queue.clips[queue.next];
        try {
          const blob = await clip.audio!;
          if (!isCurrent()) break;
          queue.currentChars = clip.text.length;
          setIsSpeaking(true);
          await playClip(audio, blob);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Failed to generate speech');
          console.error('Fish Audio error:', error);
          queue.firstError ??= error;
          if (error.message === PLAYBACK_BLOCKED) break;  // Every later clip would be blocked too
          // Otherwise skip this sentence and carry on
        }
        queue.doneChars += clip.text.length;
        queue.currentChars = 0;
        queue.next++;
      }
    } finally {
      audio.pause();
      audio.removeAttribute('src');
      audioPoolRef.current.push(audio);
      if (audioRef.current === audio) audioRef.current = null;
      if (isCurrent()) {
        setIsSpeaking(false);
        if (queue.firstError) setError(queue.firstError.message);
      }
    }
    if (queue.firstError && isCurrent()) throw queue.firstError;
  };

  // Stop talking now and forget anything queued
  const stop = useCallback(() => {
    queueIdRef.current++;
    const queue = queueRef.current;
    queueRef.current = null;
    finishRef.current?.();
    queue?.wake?.();
    audioRef.current?.pause();
    setIsSpeaking(false);
    setError(null);
  }, []);

  const startQueue = useCallback(() => {
    stop();
    const queue: SpeechQueue = {
      id: queueIdRef.current, clips: [], next: 0, ended: false, wake: null,
      totalChars: 0, doneChars: 0, currentChars: 0, firstError: null, done: Promise.resolve()
    };
    queue.done = runQueue(queue);
    queue.done.catch(() => {});  // Callers of endQueue() see the error; don't warn otherwise
    queueRef.current = queue;
  }, [stop]);

  const enqueue = useCallback((text: string) => {
    const queue = queueRef.current;
    const clean = text.trim();
    if (!queue || queue.ended || !clean) return;
    queue.clips.push({ text: clean, audio: null });
    queue.totalChars += clean.length;
    prefetch(queue);
    queue.wake?.();
    queue.wake = null;
  }, []);

  const endQueue = useCallback((): Promise<void> => {
    const queue = queueRef.current;
    if (!queue) return Promise.resolve();
    queue.ended = true;
    queue.wake?.();
    queue.wake = null;
    return queue.done;
  }, []);

  // Say one line. Resolves when finished (or stopped); rejects if audio fails or is blocked.
  const speak = useCallback((text: string): Promise<void> => {
    startQueue();
    enqueue(text);
    return endQueue();
  }, [startQueue, enqueue, endQueue]);

  // How far through everything queued BMO has spoken, 0-1
  const getProgress = useCallback((): number => {
    const queue = queueRef.current;
    const audio = audioRef.current;
    if (!queue || queue.totalChars === 0) return 0;
    const clipFraction = audio && audio.duration && isFinite(audio.duration)
      ? Math.min(1, audio.currentTime / audio.duration) : 0;
    return Math.min(1, (queue.doneChars + queue.currentChars * clipFraction) / queue.totalChars);
  }, []);

  return {
    speak,
    startQueue,
    enqueue,
    endQueue,
    isSpeaking,
    stop,
    isSupported: true,
    error,
    prewarmAudio,
    getMouthLevel,
    getProgress
  };
};
