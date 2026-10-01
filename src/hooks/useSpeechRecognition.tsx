import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechRecognition {
  transcript: string;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  cancelListening: () => void;  // Stop without keeping what was heard
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
  // Goes up by one each time a listening turn ends with nothing heard (not when cancelled)
  endedEmpty: number;
}

export const useSpeechRecognition = (): UseSpeechRecognition => {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  });

  const [endedEmpty, setEndedEmpty] = useState(0);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);  // Track listening state for iOS
  const heardRef = useRef(false);       // Did this listening turn hear anything?
  const cancelledRef = useRef(false);   // Was this turn cancelled on purpose?

  useEffect(() => {
    if (!isSupported) return;

    // Create speech recognition instance
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    
    const recognition = new SpeechRecognition();
    
    // Stop automatically when the user pauses, so one tap = one message
    recognition.continuous = false;
    recognition.interimResults = !/iPad|iPhone|iPod/.test(navigator.userAgent);  // iOS prefers final results only
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
      console.log('🎤 Listening started... Speak now!');
    };

    recognition.onresult = (event: any) => {
      console.log('📝 Speech result event:', event);
      
      // Get the transcript from the latest result
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcriptText = result[0].transcript;
        
        if (result.isFinal) {
          finalTranscript += transcriptText;
          console.log('✅ Final transcript:', transcriptText);
        } else {
          interimTranscript += transcriptText;
          console.log('⏳ Interim transcript:', transcriptText);
        }
      }
      
      // Update with final transcript if available, otherwise interim
      const textToUse = finalTranscript || interimTranscript;
      if (textToUse) {
        heardRef.current = true;
        setTranscript(textToUse);
        console.log('📝 Updated transcript:', textToUse);
      }
      
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
      isListeningRef.current = false;
    };

    recognition.onend = () => {
      console.log('🎤 Recognition ended');
      console.log('   isListeningRef:', isListeningRef.current);
      
      // Set listening to false so transcript gets processed
      setIsListening(false);
      isListeningRef.current = false;
      if (!heardRef.current && !cancelledRef.current) setEndedEmpty(n => n + 1);
      
      console.log('✅ Ready to process transcript');
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

    if (recognitionRef.current && !isListeningRef.current) {
      setTranscript('');
      setError(null);
      heardRef.current = false;
      cancelledRef.current = false;
      // Count as listening straight away, so a second start() before "onstart" is ignored
      isListeningRef.current = true;
      console.log('🎤 Starting speech recognition...');
      try {
        recognitionRef.current.start();
      } catch (err) {
        isListeningRef.current = false;
        console.error('Error starting recognition:', err);
        setError('Failed to start listening');
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      console.log('🛑 Stopping speech recognition...');
      recognitionRef.current.stop();
    }
  }, []);

  const cancelListening = useCallback(() => {
    cancelledRef.current = true;
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.abort();
    }
    setTranscript('');
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    transcript,
    isListening,
    startListening,
    stopListening,
    cancelListening,
    resetTranscript,
    isSupported,
    error,
    endedEmpty
  };
};
