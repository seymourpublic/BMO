import { useState, useRef } from 'react';

interface UseFishAudioOutput {
  speak: (text: string) => Promise<void>;
  isSpeaking: boolean;
  stop: () => void;
  isSupported: boolean;
  error: string | null;
}

export const useFishAudio = (_apiKey?: string): UseFishAudioOutput => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Check if backend is likely configured (we can't know for sure from frontend)
  const [isSupported] = useState(() => true); // Always try - backend will handle errors
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = async (text: string): Promise<void> => {
    try {
      setIsSpeaking(true);
      setError(null);

      console.log('🐟 Generating speech with Fish Audio (via backend)...');

      // Call our backend proxy instead of Fish Audio directly
      const response = await fetch('http://localhost:3001/api/tts', {
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

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setError('Failed to play audio');
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
      console.log('✅ Playing BMO voice from Fish Audio!');

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
    error
  };
};
