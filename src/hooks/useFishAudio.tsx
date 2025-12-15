import { useState, useRef } from 'react';

interface UseFishAudioOutput {
  speak: (text: string) => Promise<void>;
  isSpeaking: boolean;
  stop: () => void;
  isSupported: boolean;
  error: string | null;
  prewarmAudio: () => void;  // NEW: Prewarm audio for iOS
}

export const useFishAudio = (_apiKey?: string): UseFishAudioOutput => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);  // Pool for iOS

  // Prewarm audio elements (MUST call during user interaction!)
  const prewarmAudio = () => {
    console.log('🔥 Prewarming audio elements for iOS...');
    // Create 3 audio elements during user gesture
    // iOS allows these to play later because created during interaction
    for (let i = 0; i < 3; i++) {
      const audio = new Audio();
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audioPoolRef.current.push(audio);
    }
    console.log(`✅ ${audioPoolRef.current.length} audio elements ready`);
  };

  const speak = async (text: string): Promise<void> => {
    try {
      setIsSpeaking(true);
      setError(null);

      console.log('🐟 Generating speech with Fish Audio (via backend)...');

      // Call our backend proxy instead of Fish Audio directly
      // Call backend TTS endpoint
      // Backend URL from environment variable (Vercel) or localhost (dev)
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const API_URL = `${API_BASE_URL}/api/tts`;
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Backend TTS error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      // Get audio as blob (binary data)
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Use prewarmed audio element if available (iOS compatibility)
      let audio: HTMLAudioElement;
      if (audioPoolRef.current.length > 0) {
        audio = audioPoolRef.current.pop()!;
        console.log('🎵 Using prewarmed audio element');
      } else {
        audio = new Audio();
        console.log('⚠️ Creating new audio (may fail on iOS)');
      }
      
      audio.src = audioUrl;
      audioRef.current = audio;

      // iOS requires explicit load
      audio.load();
      
      // Set attributes (just in case)
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        // Return to pool
        audio.src = '';
        audioPoolRef.current.push(audio);
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setError('Failed to play audio');
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audio.src = '';
        audioPoolRef.current.push(audio);
        audioRef.current = null;
      };

      // iOS needs a small delay after load
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        await audio.play();
        console.log('✅ Playing BMO voice from Fish Audio!');
      } catch (playError) {
        console.error('Play error (iOS might block):', playError);
        setError('Tap to enable audio');
        setIsSpeaking(false);
      }

    } catch (err) {
      console.error('Fish Audio error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate speech');
      setIsSpeaking(false);
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  return {
    speak,
    isSpeaking,
    stop,
    isSupported,
    error,
    prewarmAudio  // NEW: Call this during user interaction!
  };
};
