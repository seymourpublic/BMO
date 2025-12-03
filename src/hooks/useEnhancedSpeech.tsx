import { useState, useEffect, useRef } from 'react';

interface UseEnhancedSpeechOutput {
  speak: (text: string, customPitch?: number, customRate?: number) => void;
  isSpeaking: boolean;
  stop: () => void;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  currentSettings: { pitch: number; rate: number };
  updateSettings: (pitch: number, rate: number) => void;
}

export const useEnhancedSpeech = (
  defaultPitch: number = 1.8, 
  defaultRate: number = 1.15
): UseEnhancedSpeechOutput => {
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

  // Enhance text with better prosody and natural pauses
  const enhanceText = (text: string): string => {
    let enhanced = text;

    // Add natural pauses at punctuation
    enhanced = enhanced.replace(/\./g, '.   '); // Longer pause at periods
    enhanced = enhanced.replace(/,/g, ',  '); // Medium pause at commas
    enhanced = enhanced.replace(/!/g, '!  '); // Pause at exclamations
    enhanced = enhanced.replace(/\?/g, '?  '); // Pause at questions

    // Add emphasis to BMO's character quirks
    enhanced = enhanced.replace(/\bBMO\b/g, 'Bee-Mo'); // Emphasize BMO's name
    enhanced = enhanced.replace(/\bFootball\b/g, 'Football!'); // Excitement about Football
    
    // Break up long sentences for more natural speech
    enhanced = enhanced.replace(/(\w{20,})/g, (match) => {
      // Add micro-pauses in long words
      return match.replace(/(.{10})/g, '$1 ');
    });

    return enhanced;
  };

  const speak = (text: string, customPitch?: number, customRate?: number) => {
    if (!isSupported) {
      console.warn('Speech synthesis not supported in this browser');
      return;
    }

    // Stop any current speech
    window.speechSynthesis.cancel();

    // Enhance the text for more natural speech
    const enhancedText = enhanceText(text);

    const utterance = new SpeechSynthesisUtterance(enhancedText);
    utteranceRef.current = utterance;

    // Use custom settings if provided, otherwise use current settings
    const usePitch = customPitch !== undefined ? customPitch : currentSettings.pitch;
    const useRate = customRate !== undefined ? customRate : currentSettings.rate;

    // Enhanced voice configuration for more natural BMO
    utterance.pitch = usePitch;
    utterance.rate = useRate;
    utterance.volume = 1;

    // Try to find the BEST voice for natural-sounding BMO
    const preferredVoiceNames = [
      // Premium voices (if available)
      'Google UK English Female',
      'Google US English Female',
      'Microsoft Aria Online',
      'Microsoft Jenny Online',
      
      // Good quality voices
      'Microsoft Zira',
      'Samantha',
      'Karen',
      'Victoria',
      'Fiona',
      
      // Child-like voices
      'Princess',
      'Kathy',
      'Junior',
      
      // Fallbacks
      'female',
      'woman'
    ];

    let selectedVoice = voices.find(voice => 
      preferredVoiceNames.some(name => 
        voice.name.toLowerCase().includes(name.toLowerCase())
      )
    );

    // Prefer "premium" or "enhanced" voices if available
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('premium') ||
        voice.name.toLowerCase().includes('enhanced') ||
        voice.name.toLowerCase().includes('natural')
      );
    }

    // Try English female voices
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
      console.log('🎵 Using enhanced voice:', selectedVoice.name);
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

    // Add some randomization to make it less robotic
    // Vary pitch slightly for more natural intonation
    if (Math.random() > 0.5) {
      utterance.pitch += (Math.random() - 0.5) * 0.1; // +/- 0.05 variation
    }

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
  };
};
