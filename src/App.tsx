import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BMOFace } from './components/BMOFace';
import { sendMessageToClaude } from './utils/api';
import { MOOD_TEXTS, STORY_PROMPTS } from './utils/constants';
import { Message, Mood } from './types';
import { useFishAudio } from './hooks/useFishAudio';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { soundEffects } from './utils/sounds';
import { bmoSongs, SPECIAL_SONG_LYRICS, SPECIAL_SONG_TRIGGERS } from './utils/songs';
import { unlockIOSAudio } from './utils/iosAudio';
import { getCurrentUser, loadUserData, getConversationContext } from './utils/userAuth';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import './App.css';

const App: React.FC = () => {
  const [mood, setMood] = useState<Mood>('happy');
  const [inputValue, setInputValue] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [displayMessages, setDisplayMessages] = useState<Array<{role: 'user' | 'assistant', text: string}>>([]);  // For chat bubbles
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [showMusicNotes, setShowMusicNotes] = useState<boolean>(false);
  const [isStarted, setIsStarted] = useState<boolean>(false);  // Track if user clicked start
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState<boolean>(false);  // Track if audio needs unlock
  const [chatMode, setChatMode] = useState<'voice' | 'text'>('voice');  // Chat mode toggle
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);  // For auto-scroll to latest message
  const hasPlayedGreeting = useRef<boolean>(false);  // Track if greeting has played
  const audioUnlocked = useRef<boolean>(false);  // Track if audio context is unlocked

  // Voice hooks - Fish Audio with actual BMO voice!
  // API key is on backend now (no CORS issues!)
  const { 
    speak, 
    isSpeaking, 
    stop: stopSpeaking, 
    isSupported: ttsSupported,
    error: voiceError,
    prewarmAudio  // NEW: Must call during user interaction!
  } = useFishAudio();
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: sttSupported,
    error: speechError
  } = useSpeechRecognition();

  // Check for existing user on mount and load conversation history
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      console.log('👤 Welcome back,', user.name);
      
      // Load user preferences
      const userData = loadUserData(user.id);
      if (userData) {
        setVoiceEnabled(userData.preferences.voiceEnabled);
        // Load last 10 messages into conversation history for context
        const context = getConversationContext(user.id);
        const messages: Message[] = context.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        setConversationHistory(messages);
        console.log(`📚 Loaded ${messages.length} messages from history`);
      }
    }
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Play greeting song after user starts (requires user interaction)
  useEffect(() => {
    if (!isStarted) return;  // Only play after user clicks start
    
    const playGreeting = async () => {
      // Prevent multiple plays
      if (hasPlayedGreeting.current) return;
      hasPlayedGreeting.current = true;
      
      // Wait a moment for everything to load
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        // Show music notes
        setShowMusicNotes(true);
        
        // Play the melody first
        setMood('excited');
        await bmoSongs.playHelloFriendMelody();
        
        // Then speak "Hello friend!" with singing voice
        if (ttsSupported && voiceEnabled) {
          try {
            await speak("♪ Hello friend! ♪");
          } catch (speakError) {
            console.warn('Voice greeting failed:', speakError);
            // Show unlock banner if audio fails
            setNeedsAudioUnlock(true);
          }
        }
        
        setMood('happy');
        setShowMusicNotes(false);
      } catch (error) {
        console.error('Greeting error:', error);
        setMood('happy');
        setShowMusicNotes(false);
        // Show unlock banner
        setNeedsAudioUnlock(true);
      }
    };
    
    playGreeting();
  }, [isStarted, ttsSupported, voiceEnabled, speak]); // Play when user starts

  // Send message to BMO - wrapped in useCallback to prevent recreating
  const sendToBMO = useCallback(async (userMessage: string) => {
    try {
      setIsTyping(true);
      setMood('thinking');

      // Check for special song trigger (hidden easter egg!)
      const messageLower = userMessage.toLowerCase();
      const isSpecialSong = SPECIAL_SONG_TRIGGERS.some(trigger => 
        messageLower.includes(trigger)
      );

      if (isSpecialSong) {
        console.log('🎵 Special song triggered!');
        
        // BMO gets excited about the special song
        setMood('excited');
        setIsTyping(false);
        
        // Play excited sound
        soundEffects.playEmote('excited');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Show music notes during song
        setShowMusicNotes(true);
        
        // Play the melody
        setMood('happy');
        await bmoSongs.playSpecialSongMelody();
        
        // Sing the lyrics!
        if (ttsSupported) {
          await speak(`♪ ${SPECIAL_SONG_LYRICS} ♪`);
        }
        
        setMood('excited');
        setShowMusicNotes(false);
        return;
      }

      // Normal conversation flow
      // Add user message to history
      const newHistory: Message[] = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      // Trim conversation history to last 6 messages (3 exchanges) for speed
      // This reduces API payload size significantly
      const trimmedHistory = newHistory.slice(-6);

      // Get BMO's response with trimmed history
      const bmoResponse = await sendMessageToClaude(trimmedHistory);

      // Extract emotes and clean text for speech
      const { cleanText, emotes } = extractEmotes(bmoResponse);

      // Update conversation history with FULL response (including emotes)
      const updatedHistory: Message[] = [
        ...newHistory,
        { role: 'assistant', content: bmoResponse }
      ];
      setConversationHistory(updatedHistory);

      // Add BMO's response to messages (FULL text with emotes for display)
      
      setIsTyping(false);
      
      // Play receive sound
      soundEffects.playReceive();
      
      // Play emote animations BEFORE speaking
      if (emotes.length > 0) {
        await playEmoteSequence(emotes);
      }
      
      // Speak the CLEAN response (only in voice mode and if voice enabled)
      if (chatMode === 'voice' && voiceEnabled && ttsSupported) {
        await speak(cleanText);
      }
      
      // Randomly change mood after responding
      const moods: Mood[] = ['happy', 'excited', 'surprised'];
      const randomMood = moods[Math.floor(Math.random() * moods.length)];
      setTimeout(() => setMood(randomMood), 500);

    } catch (error) {
      setIsTyping(false);
      console.error('Error talking to BMO:', error);
      
      // Play error sound
      soundEffects.playError();
      
      const errorMsg = "Oh no! BMO's circuits got confused! BMO needs a moment...";
      if (chatMode === 'voice' && voiceEnabled && ttsSupported) {
        speak(errorMsg);
      }
      setMood('sad');
    }
  }, [conversationHistory, chatMode, voiceEnabled, ttsSupported, speak]);

  // Extract emotes from text (like *excited*, *jumps*, etc.)
  const extractEmotes = (text: string): { cleanText: string; emotes: string[] } => {
    const emotes: string[] = [];
    
    // Find all text in asterisks
    const emoteRegex = /\*([^*]+)\*/g;
    let match;
    
    while ((match = emoteRegex.exec(text)) !== null) {
      emotes.push(match[1].toLowerCase().trim());
    }
    
    // Remove asterisks and their content for clean speech
    const cleanText = text.replace(/\*[^*]+\*/g, ' ').replace(/\s+/g, ' ').trim();
    
    console.log('🎭 Extracted emotes:', emotes);
    console.log('🗣️ Clean text for speech:', cleanText);
    
    return { cleanText, emotes };
  };

  // Play a sequence of emote animations
  const playEmoteSequence = async (emotes: string[]) => {
    for (const emote of emotes) {
      const mood = emoteToMood(emote);
      console.log(`🎭 Acting out: ${emote} → ${mood}`);
      
      setMood(mood);
      
      // Play emote sound
      soundEffects.playEmote(emote);
      
      // Hold the expression for a moment
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  };

  // Map emotes to BMO moods
  const emoteToMood = (emote: string): Mood => {
    // Excitement emotes
    if (emote.includes('excit') || emote.includes('jump') || emote.includes('bounce') || 
        emote.includes('yay') || emote.includes('cheer')) {
      return 'excited';
    }
    
    // Happy emotes
    if (emote.includes('smile') || emote.includes('grin') || emote.includes('giggle') || 
        emote.includes('laugh') || emote.includes('happy')) {
      return 'happy';
    }
    
    // Surprised emotes
    if (emote.includes('gasp') || emote.includes('wow') || emote.includes('surpris') || 
        emote.includes('shock') || emote.includes('amaz')) {
      return 'surprised';
    }
    
    // Sad emotes
    if (emote.includes('sad') || emote.includes('cry') || emote.includes('tear') || 
        emote.includes('frown') || emote.includes('sigh')) {
      return 'sad';
    }
    
    // Thinking emotes
    if (emote.includes('think') || emote.includes('ponder') || emote.includes('hmm') || 
        emote.includes('wonder')) {
      return 'thinking';
    }
    
    // Confused emotes
    if (emote.includes('confus') || emote.includes('puzzle') || emote.includes('scratch')) {
      return 'confused';
    }
    
    // Screen-related emotes
    if (emote.includes('screen') || emote.includes('light') || emote.includes('glow') || 
        emote.includes('blink')) {
      return 'excited'; // Flash excitedly
    }
    
    // Default to happy for unknown emotes
    return 'happy';
  };

  // Handle completed voice transcript
  useEffect(() => {
    if (transcript && !isListening && transcript.trim().length > 0) {
      console.log('🎯 Auto-sending transcript:', transcript);
      
      // Auto-fill the input with transcript
      setInputValue(transcript);
      
      // Auto-send after a short delay (so user can see it)
      const autoSendTimer = setTimeout(() => {
        const messageToSend = transcript.trim();
        if (messageToSend.length > 0) {
          console.log('📤 Sending message:', messageToSend);
          sendToBMO(messageToSend);
          setInputValue('');
          resetTranscript();
        }
      }, 500);
      
      return () => clearTimeout(autoSendTimer);
    }
  }, [transcript, isListening, resetTranscript, sendToBMO]);

  // Update display messages when conversation changes
  useEffect(() => {
    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      text: msg.content
    }));
    setDisplayMessages(messages);
  }, [conversationHistory]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  // Handle sending message
  const handleSendMessage = () => {
    if (inputValue.trim() === '' || isTyping) return;
    
    const userMessage = inputValue.trim();
    setInputValue('');
    
    // Play send sound
    soundEffects.playSend();
    
    sendToBMO(userMessage);
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Quick action: Ask for story
  const askForStory = () => {
    const randomPrompt = STORY_PROMPTS[Math.floor(Math.random() * STORY_PROMPTS.length)];
    
    // Play button click sound
    soundEffects.playButtonClick();
    
    sendToBMO(randomPrompt);
  };

  // Toggle voice input
  const toggleListening = () => {
    if (isListening) {
      stopListening();
      soundEffects.playVoiceStop();
    } else {
      startListening();
      soundEffects.playVoiceStart();
    }
  };

  // Toggle voice output
  const toggleVoice = () => {
    if (voiceEnabled) {
      stopSpeaking();
    }
    setVoiceEnabled(!voiceEnabled);
    
    // Play button click sound
    soundEffects.playButtonClick();
  };

  // Toggle between voice and text chat mode
  const toggleChatMode = () => {
    const newMode = chatMode === 'voice' ? 'text' : 'voice';
    setChatMode(newMode);
    
    // Stop any ongoing voice activity when switching to text
    if (newMode === 'text') {
      if (isListening) stopListening();
      if (isSpeaking) stopSpeaking();
    }
    
    // Play button click sound
    soundEffects.playButtonClick();
    
    console.log(`📝 Chat mode: ${newMode}`);
  };

  // Handle start button - request permissions and initialize audio (iOS compatible)
  const handleStart = async () => {
    try {
      console.log('🎮 Starting BMO...');
      
      // CRITICAL FOR iOS: Prewarm audio elements FIRST (during user gesture)
      prewarmAudio();
      
      // iOS-specific unlock (must be first, during user interaction)
      const unlocked = await unlockIOSAudio();
      console.log('iOS unlock result:', unlocked);
      
      // Initialize all audio systems
      await soundEffects.initialize();
      await bmoSongs.initialize();
      
      // Mark as unlocked
      audioUnlocked.current = true;
      
      // Play a button click to test audio
      await new Promise(resolve => setTimeout(resolve, 150));
      
      try {
        soundEffects.playButtonClick();
        console.log('✅ Button click played');
      } catch (clickError) {
        console.warn('Button click failed:', clickError);
      }
      
      // Request microphone permission upfront (if supported)
      if (sttSupported) {
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log('🎤 Microphone permission granted');
        } catch (micError) {
          console.warn('Microphone permission denied:', micError);
          // Continue anyway - user can still type
        }
      }
      
      // Wait for audio to be fully ready
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Set as started (triggers greeting)
      setIsStarted(true);
      console.log('✅ BMO started successfully');
    } catch (error) {
      console.error('Initialization error:', error);
      // Still start even if something failed
      setIsStarted(true);
    }
  };

  // Global click handler to unlock audio if needed
  const handleGlobalClick = async () => {
    if (!audioUnlocked.current && isStarted) {
      console.log('🔄 Attempting to unlock audio on tap...');
      try {
        await unlockIOSAudio();
        await soundEffects.initialize();
        await bmoSongs.initialize();
        
        // Test it works
        soundEffects.playButtonClick();
        
        audioUnlocked.current = true;
        setNeedsAudioUnlock(false);
        
        // Retry greeting
        if (hasPlayedGreeting.current && ttsSupported && voiceEnabled) {
          try {
            await speak("♪ Hello friend! ♪");
          } catch (e) {
            console.warn('Retry greeting failed:', e);
          }
        }
        
        console.log('✅ Audio unlocked on tap!');
      } catch (error) {
        console.error('Failed to unlock on tap:', error);
      }
    }
  };

  // Manual retry for greeting
  const retryGreeting = async () => {
    try {
      setNeedsAudioUnlock(false);
      setShowMusicNotes(true);
      setMood('excited');
      
      // CRITICAL: Prewarm audio elements (during user gesture)
      prewarmAudio();
      
      await unlockIOSAudio();
      await soundEffects.initialize();
      await bmoSongs.initialize();
      
      soundEffects.playButtonClick();
      await new Promise(r => setTimeout(r, 200));
      
      await bmoSongs.playHelloFriendMelody();
      
      if (ttsSupported && voiceEnabled) {
        await speak("♪ Hello friend! ♪");
      }
      
      audioUnlocked.current = true;
      setMood('happy');
      setShowMusicNotes(false);
    } catch (error) {
      console.error('Retry failed:', error);
      setMood('happy');
      setShowMusicNotes(false);
      setNeedsAudioUnlock(true);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-[#1a5f7a] via-[#2d8a9e] to-[#57c4d8] flex items-center justify-center p-5 relative overflow-hidden font-orbitron"
      onClick={handleGlobalClick}
    >
      {/* Audio Unlock Banner (iOS fallback) */}
      {needsAudioUnlock && isStarted && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-sm w-full px-4">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-2xl shadow-2xl border-2 border-orange-400">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🔊</span>
              <div className="flex-1">
                <p className="font-press-start text-xs mb-2">Audio Blocked</p>
                <p className="text-xs mb-3 opacity-90">iOS requires a tap to play audio</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    retryGreeting();
                  }}
                  className="w-full bg-white text-orange-600 px-4 py-2 rounded-lg font-press-start text-xs hover:bg-orange-50 active:scale-95 transition-all shadow-md"
                >
                  🎵 Enable Audio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Start Screen */}
      {!isStarted && (
        <div className="fixed inset-0 bg-gradient-to-br from-[#1a5f7a] via-[#2d8a9e] to-[#57c4d8] flex items-center justify-center z-50">
          <div className="text-center space-y-8 max-w-md px-6 animate-fade-in">
            {/* BMO Preview - Animated */}
            <div className="relative">
              <div className="text-9xl animate-bounce-slow">🎮</div>
              <div className="absolute -inset-4 bg-[#8ee4d4]/20 rounded-full blur-xl animate-pulse" />
            </div>
            
            {/* Title with Glow Effect */}
            <div className="space-y-3">
              <h1 className="text-6xl font-press-start text-white mb-3 drop-shadow-[0_0_20px_rgba(142,228,212,0.5)] animate-pulse">
                BMO
              </h1>
              <p className="text-base text-[#8ee4d4] font-press-start text-xs leading-relaxed">
                Your AI Friend from Adventure Time
              </p>
            </div>
            
            {/* Permissions Info - More Visual */}
            <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-6 space-y-4 text-left border-2 border-[#8ee4d4]/30">
              <div className="flex items-start gap-3">
                <span className="text-3xl">🎤</span>
                <div>
                  <p className="text-white font-bold text-sm">Microphone Access</p>
                  <p className="text-[#8ee4d4] text-xs mt-1">Talk to BMO with your voice</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="text-3xl">🔊</span>
                <div>
                  <p className="text-white font-bold text-sm">Audio Playback</p>
                  <p className="text-[#8ee4d4] text-xs mt-1">Hear BMO's voice and songs</p>
                </div>
              </div>
              
              {/* iOS-specific warning */}
              {/iPad|iPhone|iPod/.test(navigator.userAgent) && (
                <div className="flex items-start gap-3 bg-orange-500/20 p-3 rounded-lg border border-orange-500/30">
                  <span className="text-2xl">📱</span>
                  <div>
                    <p className="text-orange-200 font-bold text-xs">iOS Users</p>
                    <p className="text-orange-100 text-xs mt-1">
                      Make sure ringer switch is ON and volume is up!
                    </p>
                  </div>
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t border-[#8ee4d4]/20">
                <p className="text-[#8ee4d4] text-xs text-center">
                  ✨ Click below to grant permissions & wake up BMO! ✨
                </p>
              </div>
            </div>
            
            {/* Start Button - Big and Inviting */}
            <button
              onClick={handleStart}
              className="group w-full py-5 px-8 bg-gradient-to-br from-[#2ecc71] via-[#27ae60] to-[#229954] text-white rounded-2xl font-press-start text-base shadow-[0_8px_0_#1e8449] hover:shadow-[0_6px_0_#1e8449] hover:translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_#1e8449] transition-all duration-150 uppercase border-2 border-[#27ae60] hover:border-[#2ecc71] relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                <span className="text-2xl group-hover:animate-bounce">🎮</span>
                <span>Wake Up BMO!</span>
                <span className="text-2xl group-hover:animate-bounce animation-delay-150">🎵</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
            </button>
            
            {/* Footer Notes */}
            <div className="space-y-2">
              <p className="text-[#8ee4d4] text-xs opacity-90 flex items-center justify-center gap-2">
                <span>🎵</span>
                <span>Best experienced with sound on!</span>
                <span>🎵</span>
              </p>
              <p className="text-white/50 text-xs">
                Permissions are only used for voice features
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Animated background particles */}
      <div className="fixed inset-0 opacity-20 pointer-events-none animate-float">
        <div className="absolute w-2 h-2 bg-white rounded-full top-[20%] left-[20%]" />
        <div className="absolute w-2 h-2 bg-white rounded-full top-[80%] left-[80%]" />
        <div className="absolute w-2 h-2 bg-white rounded-full top-[40%] left-[60%]" />
      </div>

      {/* Floating Music Notes (when singing) */}
      {showMusicNotes && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="absolute text-4xl animate-float-up top-[20%] left-[30%]" style={{ animationDelay: '0s' }}>♪</div>
          <div className="absolute text-5xl animate-float-up top-[40%] left-[60%]" style={{ animationDelay: '0.3s' }}>♫</div>
          <div className="absolute text-4xl animate-float-up top-[60%] left-[20%]" style={{ animationDelay: '0.6s' }}>♬</div>
          <div className="absolute text-5xl animate-float-up top-[30%] left-[70%]" style={{ animationDelay: '0.9s' }}>♪</div>
          <div className="absolute text-4xl animate-float-up top-[70%] left-[50%]" style={{ animationDelay: '1.2s' }}>♫</div>
          <div className="absolute text-5xl animate-float-up top-[50%] left-[40%]" style={{ animationDelay: '1.5s' }}>♪</div>
        </div>
      )}

      {/* BMO Console */}
      <div className="relative z-10 w-full max-w-[420px]">
        {/* Name Badge */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#f39c12] to-[#e67e22] text-white font-press-start text-xs px-5 py-2 rounded-full shadow-lg tracking-[2px] animate-bounce-slow">
          BMO
        </div>

        {/* Main Console Body */}
        <div className="bg-gradient-to-b from-[#5dcdce] via-[#4fb8b9] to-[#3fa4a5] rounded-[28px] p-6 shadow-2xl relative animate-appear border-4 border-[#3fa4a5]">
          {/* Status Light */}
          <div className="absolute top-4 right-4 w-3 h-3 bg-[#2ecc71] rounded-full shadow-[0_0_10px_rgba(46,204,113,0.8)] animate-pulse" />
          
          {/* Cartridge Slot */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-32 h-3 bg-[#2d6d6e] rounded-sm shadow-inner flex items-center justify-center gap-0.5">
            <div className="w-0.5 h-1.5 bg-[#0a3d3f] rounded-full"></div>
            <div className="w-0.5 h-1.5 bg-[#0a3d3f] rounded-full"></div>
            <div className="w-0.5 h-1.5 bg-[#0a3d3f] rounded-full"></div>
          </div>

          {/* Side ports */}
          <div className="absolute left-2 top-20 flex flex-col gap-2">
            <div className="w-4 h-2 bg-[#2d6d6e] rounded-sm shadow-inner border border-[#0a3d3f]"></div>
            <div className="w-4 h-2 bg-[#2d6d6e] rounded-sm shadow-inner border border-[#0a3d3f]"></div>
          </div>
          
          <div className="absolute right-2 top-20 flex flex-col gap-2">
            <div className="w-4 h-2 bg-[#2d6d6e] rounded-sm shadow-inner border border-[#0a3d3f]"></div>
            <div className="w-4 h-2 bg-[#2d6d6e] rounded-sm shadow-inner border border-[#0a3d3f]"></div>
          </div>
          
          {/* Screen */}
          <div className="bg-gradient-to-b from-[#8ee4d4] to-[#6dd4c4] rounded-2xl p-5 mb-6 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] min-h-[200px] max-h-[400px] relative overflow-hidden border-4 border-[#3fa4a5]">
            {/* Scanline effect */}
            <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.03)_0px,rgba(0,0,0,0.03)_2px,transparent_2px,transparent_4px)] animate-scanline" />
            
            {/* Screen reflection overlay */}
            <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-t-2xl" />
            
            {/* VOICE MODE: Show BMO Face */}
            {chatMode === 'voice' && (
              <>
                <BMOFace mood={mood} isSpeaking={isSpeaking} isListening={isListening} />
                
                {/* Mood Indicator */}
                <div className="text-center mt-2 space-y-1">
                  <div className="font-press-start text-[8px] text-[#2a5d5f] uppercase tracking-wider">
                    {isListening ? '🎤 LISTENING...' : isSpeaking ? '🔊 SPEAKING...' : MOOD_TEXTS[mood]}
                  </div>
                  {/* Chat Mode Badge */}
                  <div className="inline-block px-2 py-0.5 rounded text-[6px] font-press-start bg-blue-500/20 text-blue-700">
                    🎤 VOICE MODE
                  </div>
                </div>
              </>
            )}
            
            {/* TEXT MODE: Show Chat Bubbles */}
            {chatMode === 'text' && (
              <div className="h-full flex flex-col">
                {/* Chat Mode Badge (top) */}
                <div className="text-center mb-2">
                  <div className="inline-block px-2 py-0.5 rounded text-[6px] font-press-start bg-orange-500/20 text-orange-700">
                    💬 TEXT MODE
                  </div>
                </div>
                
                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                  {displayMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="text-4xl mb-2">💬</div>
                      <div className="font-press-start text-[8px] text-[#2a5d5f]/70">
                        Start chatting with BMO!
                      </div>
                    </div>
                  ) : (
                    <>
                      {displayMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] px-3 py-2 rounded-lg text-xs break-words ${
                              msg.role === 'user'
                                ? 'bg-[#3498db] text-white rounded-br-none shadow-md'
                                : 'bg-white/90 text-[#2a5d5f] rounded-bl-none shadow-md border-2 border-[#3fa4a5]'
                            }`}
                          >
                            {msg.role === 'assistant' && (
                              <div className="font-bold text-[10px] mb-1 text-[#e67e22]">🎮 BMO</div>
                            )}
                            <div className={msg.role === 'user' ? 'font-medium' : ''}>
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
                
                {/* Typing Indicator in chat */}
                {isTyping && (
                  <div className="flex justify-start mt-2">
                    <div className="bg-white/90 px-3 py-2 rounded-lg rounded-bl-none shadow-md border-2 border-[#3fa4a5]">
                      <div className="font-bold text-[10px] mb-1 text-[#e67e22]">🎮 BMO</div>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-[#2a5d5f] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-[#2a5d5f] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-[#2a5d5f] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Listening Tip (iOS) - shown in both modes if listening */}
            {chatMode === 'voice' && isListening && /iPad|iPhone|iPod/.test(navigator.userAgent) && (
              <div className="text-center text-[10px] text-[#2a5d5f]/70 mt-1">
                Speak clearly and wait for response
              </div>
            )}
            
            {/* Voice Error Display */}
            {speechError && (
              <div className="text-center text-xs text-red-600 mt-1">
                {speechError}
              </div>
            )}
            
            {/* Enhanced Typing Indicator */}
            {isTyping && (
              <div className="flex items-center justify-center gap-2 mt-3 p-3 bg-gradient-to-r from-[#5dcdce]/20 to-[#4fb8b9]/20 rounded-lg border-2 border-[#5dcdce]/50">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#4fb8b9] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-[#4fb8b9] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-[#4fb8b9] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-[#4fb8b9] text-xs font-bold">
                  BMO is thinking...
                </span>
              </div>
            )}
            
            {/* Voice Generation Indicator */}
            {isSpeaking && (
              <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-gradient-to-r from-[#2ecc71]/20 to-[#27ae60]/20 rounded-lg border-2 border-[#2ecc71]/50">
                <div className="flex gap-1">
                  <div className="w-1.5 h-4 bg-[#2ecc71] rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-6 bg-[#2ecc71] rounded-full animate-pulse" style={{ animationDelay: '100ms' }}></div>
                  <div className="w-1.5 h-5 bg-[#2ecc71] rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
                  <div className="w-1.5 h-7 bg-[#2ecc71] rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                  <div className="w-1.5 h-4 bg-[#2ecc71] rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
                </div>
                <span className="text-[#2ecc71] text-xs font-bold">
                  🎵 BMO is speaking...
                </span>
              </div>
            )}
          </div>

          {/* Voice Controls */}
          <div className="flex gap-2 mb-4">
            {/* Chat Mode Toggle */}
            <button
              onClick={toggleChatMode}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-press-start text-[8px] transition-all ${
                chatMode === 'voice'
                  ? 'bg-gradient-to-b from-[#3498db] to-[#2980b9] text-white shadow-[0_4px_0_#1f5f8b]'
                  : 'bg-gradient-to-b from-[#f39c12] to-[#e67e22] text-white shadow-[0_4px_0_#c0730e]'
              } hover:-translate-y-0.5 active:translate-y-0.5 uppercase`}
            >
              {chatMode === 'voice' ? '🎤' : '💬'}
              {chatMode === 'voice' ? 'Voice' : 'Text'}
            </button>
            
            {sttSupported && chatMode === 'voice' && (
              <button
                onClick={toggleListening}
                disabled={isTyping}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-press-start text-[8px] transition-all ${
                  isListening
                    ? 'bg-red-500 text-white shadow-lg animate-pulse'
                    : 'bg-gradient-to-b from-[#2d6d6e] to-[#1e4d4e] text-[#8ee4d4] shadow-[0_4px_0_#0a2d2e]'
                } hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-50 uppercase`}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                {isListening ? 'Stop' : 'Talk'}
              </button>
            )}
            
            {ttsSupported && chatMode === 'voice' && (
              <button
                onClick={toggleVoice}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-press-start text-[8px] transition-all ${
                  voiceEnabled
                    ? 'bg-gradient-to-b from-[#2ecc71] to-[#27ae60] text-white shadow-[0_4px_0_#229954]'
                    : 'bg-gradient-to-b from-[#95a5a6] to-[#7f8c8d] text-white shadow-[0_4px_0_#5a6c6d]'
                } hover:-translate-y-0.5 active:translate-y-0.5 uppercase`}
              >
                {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                Voice
              </button>
            )}
          </div>

          {/* BMO's Physical Buttons */}
          <div className="mb-4 py-4 px-2 bg-gradient-to-b from-[#4fb8b9] to-[#3fa4a5] rounded-xl border-2 border-[#2d6d6e]">
            <div className="flex justify-between items-center px-4">
              {/* D-Pad (Left) */}
              <div className="relative w-24 h-24">
                {/* D-pad background */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-20 h-20">
                    {/* Center */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-[#1a5f7a] rounded-sm"></div>
                    
                    {/* Up */}
                    <button className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-7 bg-gradient-to-b from-[#f4c430] to-[#daa520] rounded-t-md shadow-md hover:brightness-110 active:brightness-90 transition-all">
                      <div className="text-[10px] text-[#1a5f7a] font-bold">▲</div>
                    </button>
                    
                    {/* Right */}
                    <button className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-6 bg-gradient-to-r from-[#f4c430] to-[#daa520] rounded-r-md shadow-md hover:brightness-110 active:brightness-90 transition-all">
                      <div className="text-[10px] text-[#1a5f7a] font-bold">▶</div>
                    </button>
                    
                    {/* Down */}
                    <button className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-7 bg-gradient-to-t from-[#f4c430] to-[#daa520] rounded-b-md shadow-md hover:brightness-110 active:brightness-90 transition-all">
                      <div className="text-[10px] text-[#1a5f7a] font-bold">▼</div>
                    </button>
                    
                    {/* Left */}
                    <button className="absolute left-0 top-1/2 -translate-y-1/2 w-7 h-6 bg-gradient-to-l from-[#f4c430] to-[#daa520] rounded-l-md shadow-md hover:brightness-110 active:brightness-90 transition-all">
                      <div className="text-[10px] text-[#1a5f7a] font-bold">◀</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* XYAB Buttons (Right) */}
              <div className="relative w-24 h-24">
                {/* Y (Top - Blue) */}
                <button className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-gradient-to-b from-[#4169e1] to-[#1e3a8a] rounded-full shadow-lg border-2 border-[#1a237e] hover:scale-110 active:scale-95 transition-all">
                  <div className="text-white font-bold text-xs">Y</div>
                </button>
                
                {/* B (Right - Red) */}
                <button className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-gradient-to-b from-[#ef4444] to-[#dc2626] rounded-full shadow-lg border-2 border-[#991b1b] hover:scale-110 active:scale-95 transition-all">
                  <div className="text-white font-bold text-sm">B</div>
                </button>
                
                {/* A (Bottom - Green) */}
                <button className="absolute bottom-0 left-1/2 -translate-x-1/2 w-9 h-9 bg-gradient-to-b from-[#22c55e] to-[#16a34a] rounded-full shadow-lg border-2 border-[#15803d] hover:scale-110 active:scale-95 transition-all">
                  <div className="text-white font-bold text-sm">A</div>
                </button>
                
                {/* X (Left - Light Blue/Cyan) */}
                <button className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-gradient-to-b from-[#06b6d4] to-[#0891b2] rounded-full shadow-lg border-2 border-[#0e7490] hover:scale-110 active:scale-95 transition-all">
                  <div className="text-white font-bold text-xs">X</div>
                </button>
              </div>
            </div>
            
            {/* Button labels */}
            <div className="flex justify-between px-6 mt-2">
              <div className="text-[#1a5f7a] font-press-start text-[6px] uppercase">D-Pad</div>
              <div className="text-[#1a5f7a] font-press-start text-[6px] uppercase">Action</div>
            </div>
          </div>

          {/* Fish Audio Status */}
          {!ttsSupported && (
            <div className="mb-4 p-3 bg-yellow-100 border-2 border-yellow-400 rounded-lg">
              <p className="text-xs text-yellow-800 font-bold">
                🐟 Fish Audio not configured
              </p>
              <p className="text-xs text-yellow-700 mt-1">
                Add VITE_FISH_AUDIO_API_KEY to .env for BMO's real voice!
              </p>
            </div>
          )}
          {voiceError && !isSpeaking && (
            <div className="mb-4 p-3 bg-red-100 border-2 border-red-400 rounded-lg">
              <p className="text-xs text-red-800 font-bold">Voice Error:</p>
              <p className="text-xs text-red-700 mt-1">{voiceError}</p>
            </div>
          )}

          {/* Quick Action */}
          <div className="mb-5">
            <button
              onClick={askForStory}
              className="w-full btn-retro-primary"
              disabled={isTyping}
            >
              Tell me a story!
            </button>
          </div>

          {/* Input Section */}
          <div className="bg-black/20 rounded-xl p-4 shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]">
            <div className="flex gap-3 items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? "Listening..." : "Talk to BMO..."}
                className="flex-1 bg-white/95 border-3 border-[#2d6d6e] rounded-lg px-4 py-3 text-sm text-[#1a5f7a] placeholder:text-[#7fb8b9] focus:outline-none focus:border-[#f39c12] focus:shadow-[0_0_0_3px_rgba(243,156,18,0.2)] transition-all"
                disabled={isTyping || isListening}
              />
              <button
                onClick={handleSendMessage}
                disabled={isTyping || inputValue.trim() === '' || isListening}
                className="bg-gradient-to-br from-[#f39c12] to-[#e67e22] text-white font-press-start text-[10px] px-5 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed uppercase"
              >
                Send
              </button>
            </div>
          </div>

          {/* Speaker Grills */}
          <div className="absolute bottom-5 left-5 w-[60px] h-[40px] rounded-lg opacity-40 bg-[repeating-linear-gradient(0deg,#2d6d6e_0px,#2d6d6e_3px,transparent_3px,transparent_6px)]" />
          <div className="absolute bottom-5 right-5 w-[60px] h-[40px] rounded-lg opacity-40 bg-[repeating-linear-gradient(0deg,#2d6d6e_0px,#2d6d6e_3px,transparent_3px,transparent_6px)]" />
        </div>
      </div>
    </div>
  );
};

export default App;
