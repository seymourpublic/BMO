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
      
      // Validate blob
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Received empty audio from backend');
      }
      
      console.log(`📦 Received audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      // Validate blob type
      if (!audioBlob.type.includes('audio') && !audioBlob.type.includes('mpeg')) {
        console.warn('⚠️ Unexpected blob type:', audioBlob.type);
      }
      
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

      // Set attributes BEFORE load (iOS requirement)
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      
      // iOS requires explicit load
      audio.load();

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        // Clean up event handlers before returning to pool
        audio.onended = null;
        audio.onerror = null;
        audio.src = '';
        audioPoolRef.current.push(audio);
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        // Ignore errors if audio src is empty (happens when returning to pool)
        if (!audio.src || audio.src === '') {
          console.log('Ignoring error for empty audio element');
          return;
        }
        
        console.error('Audio playback error:', e);
        console.error('Audio element state:', {
          src: audio.src,
          readyState: audio.readyState,
          error: audio.error ? {
            code: audio.error.code,
            message: audio.error.message
          } : 'none'
        });
        
        // Provide helpful error based on error code
        let errorMsg = 'Failed to play audio';
        if (audio.error) {
          switch (audio.error.code) {
            case 1: // MEDIA_ERR_ABORTED
              // Don't show error for aborted (user stopped it)
              console.log('Audio aborted by user');
              return;
            case 2: // MEDIA_ERR_NETWORK
              errorMsg = 'Network error loading audio';
              break;
            case 3: // MEDIA_ERR_DECODE
              errorMsg = 'Audio decoding error';
              break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
              errorMsg = 'Audio format not supported';
              break;
          }
        }
        
        setError(errorMsg);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        // Clean up event handlers
        audio.onended = null;
        audio.onerror = null;
        audio.src = '';
        audioPoolRef.current.push(audio);
        audioRef.current = null;
      };

      // iOS needs a small delay after load
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        await audio.play();
        console.log('✅ Playing BMO voice from Fish Audio!');
        setError(null);  // Clear any previous errors on success
      } catch (playError) {
        console.error('Play error (iOS might block):', playError);
        setError('Failed to play audio');
        setIsSpeaking(false);
        // Clean up and return audio to pool on error
        audio.onended = null;
        audio.onerror = null;
        audio.src = '';
        audioPoolRef.current.push(audio);
        audioRef.current = null;
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
      // Clean up event handlers
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      // Return to pool
      const audio = audioRef.current;
      audio.src = '';
      audioPoolRef.current.push(audio);
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setError(null);  // Clear any errors when manually stopped
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
