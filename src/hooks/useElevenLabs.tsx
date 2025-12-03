import { useState, useRef } from 'react';

interface UseElevenLabsOutput {
  speak: (text: string) => Promise<void>;
  isSpeaking: boolean;
  stop: () => void;
  isSupported: boolean;
  error: string | null;
}

export const useElevenLabs = (apiKey?: string): UseElevenLabsOutput => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => !!apiKey);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = async (text: string): Promise<void> => {
    if (!isSupported) {
      setError('ElevenLabs API key not configured');
      return;
    }

    if (!apiKey) {
      setError('ElevenLabs API key missing');
      return;
    }

    try {
      setIsSpeaking(true);
      setError(null);

      console.log('🎵 Generating natural speech with ElevenLabs...');

      // ElevenLabs API endpoint
      // Using a child-like, energetic voice for BMO
      const voiceId = 'pNInz6obpgDQGcFmaJgB'; // Adam - young, energetic voice
      // Alternative voices:
      // 'EXAVITQu4vr4xnSDxMaL' - Bella - soft, young
      // 'MF3mGyEYCl7XYWbV9V6O' - Elli - child-like
      // 'TxGEqnHWrfWFTfGW9XjX' - Josh - young boy

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5, // Lower = more expressive (0-1)
              similarity_boost: 0.75, // Higher = more like original voice (0-1)
              style: 0.5, // Exaggeration (0-1)
              use_speaker_boost: true
            }
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ElevenLabs API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      // Get audio as blob
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
      console.log('✅ Playing natural speech!');

    } catch (err) {
      console.error('ElevenLabs error:', err);
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
