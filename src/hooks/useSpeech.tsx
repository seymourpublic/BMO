import { useState, useEffect, useRef } from 'react';

interface UseSpeechOutput {
  speak: (text: string, customPitch?: number, customRate?: number) => void;
  isSpeaking: boolean;
  stop: () => void;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  currentSettings: { pitch: number; rate: number };
}

export const useSpeech = (defaultPitch: number = 1.8, defaultRate: number = 1.15): UseSpeechOutput => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSupported] = useState(() => 'speechSynthesis' in window);
  const [currentSettings, setCurrentSettings] = useState({ pitch: defaultPitch, rate: defaultRate });
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  const speak = (text: string, customPitch?: number, customRate?: number) => {
    if (!isSupported) {
      console.warn('Speech synthesis not supported in this browser');
      return;
    }

    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;

    // Use custom settings if provided, otherwise use current settings
    const usePitch = customPitch !== undefined ? customPitch : currentSettings.pitch;
    const useRate = customRate !== undefined ? customRate : currentSettings.rate;

    // BMO voice configuration - Tuned to sound more like the show!
    utterance.pitch = usePitch;  // Higher pitch for BMO's childlike voice (range: 0-2, default: 1)
    utterance.rate = useRate;    // Slightly faster, more energetic (range: 0.1-10, default: 1)
    utterance.volume = 1;        // Full volume (range: 0-1)

    // Try to find the BEST voice for BMO
    // Priority: child voices, then high female voices, then any female voice
    const preferredVoiceNames = [
      // Child voices (best match)
      'Google UK English Female',
      'Microsoft Zira',
      
      // High-pitched female voices (good match)
      'Karen',
      'Samantha',
      'Victoria',
      'Princess',
      'Kathy',
      'Kyoko',
      
      // Any female voice (fallback)
      'female',
      'woman',
      
      // Child/young sounding (fallback)
      'child',
      'junior'
    ];

    let selectedVoice = voices.find(voice => 
      preferredVoiceNames.some(name => 
        voice.name.toLowerCase().includes(name.toLowerCase())
      )
    );

    // If no preferred voice, try to find by language and gender
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        (voice.name.toLowerCase().includes('female') || 
         voice.name.toLowerCase().includes('woman'))
      );
    }

    // Last resort: any English voice
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => voice.lang.startsWith('en'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log('🎵 Using voice:', selectedVoice.name);
    }

    // Event handlers
    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      utteranceRef.current = null;
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      utteranceRef.current = null;
    };

    // Speak!
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      utteranceRef.current = null;
    }
  };

  const updateSettings = (pitch: number, rate: number) => {
    setCurrentSettings({ pitch, rate });
  };

  return {
    speak,
    isSpeaking,
    stop,
    isSupported,
    voices,
    currentSettings,
    updateSettings
  } as UseSpeechOutput & { updateSettings: (pitch: number, rate: number) => void };
};
