import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechRecognition {
  transcript: string;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
}

export const useSpeechRecognition = (): UseSpeechRecognition => {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  });

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupported) return;

    // Create speech recognition instance
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    
    const recognition = new SpeechRecognition();
    
    // Configuration for BMO - IMPROVED!
    recognition.continuous = true;  // Keep listening (don't stop on pause)
    recognition.interimResults = true;  // Show results as user speaks
    recognition.lang = 'en-US';  // English
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      console.log('🎤 Listening started... Speak now!');
    };

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcriptText = event.results[current][0].transcript;
      
      setTranscript(transcriptText);
      console.log('📝 Transcript:', transcriptText);
      
      // Clear any previous errors when we get results
      setError(null);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      // Only show error for real problems, not no-speech
      if (event.error === 'no-speech') {
        // Just log, don't show error to user
        console.log('⚠️ No speech detected - try speaking louder or closer to mic');
        setError(null); // Don't show error for no-speech
      } else if (event.error === 'not-allowed') {
        setError("🚫 Microphone access denied. Please allow microphone access in browser settings.");
      } else if (event.error === 'network') {
        setError("🌐 Network error. Check your connection.");
      } else if (event.error === 'aborted') {
        // Normal - user stopped listening
        setError(null);
      } else {
        setError(`⚠️ Error: ${event.error}`);
      }
      
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      console.log('🎤 Listening stopped');
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isSupported]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    if (recognitionRef.current && !isListening) {
      setTranscript('');
      setError(null);
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Error starting recognition:', err);
        setError('Failed to start listening');
      }
    }
  }, [isSupported, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error
  };
};
