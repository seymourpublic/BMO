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
  const isListeningRef = useRef<boolean>(false);  // Track listening state for iOS

  useEffect(() => {
    if (!isSupported) return;

    // Create speech recognition instance
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    
    const recognition = new SpeechRecognition();
    
    // Configuration for BMO - IMPROVED for better pickup!
    recognition.continuous = true;  // Keep listening (don't stop on pause)
    recognition.interimResults = true;  // Show results as user speaks
    recognition.lang = 'en-US';  // English
    recognition.maxAlternatives = 1;
    
    // iOS-specific: These help with pickup
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      console.log('📱 iOS detected - optimizing speech recognition');
      // iOS works better with slightly different settings
      recognition.continuous = false;  // iOS prefers non-continuous
      recognition.interimResults = false;  // iOS prefers final results only
    }

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
      console.log('🎤 Starting speech recognition...');
      try {
        recognitionRef.current.start();
      } catch (err) {
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
