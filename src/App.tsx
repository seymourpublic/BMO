import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BMOFace } from './components/BMOFace';
import { LoginScreen } from './components/LoginScreen';
import { ConversationHistory } from './components/ConversationHistory';
import { sendMessageToClaude, preloadCommonPhrases } from './utils/api';
import { MOOD_TEXTS, STORY_PROMPTS } from './utils/constants';
import { Message, Mood } from './types';
import { useFishAudio } from './hooks/useFishAudio';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { soundEffects } from './utils/sounds';
import { bmoSongs, SPECIAL_SONG_LYRICS, SPECIAL_SONG_TRIGGERS } from './utils/songs';
import { unlockIOSAudio } from './utils/iosAudio';
import { 
  getCurrentUser, 
  createUser, 
  loadUserData, 
  addMessageToHistory, 
  getConversationContext,
  clearConversationHistory,
  logout,
  User 
} from './utils/userAuth';
import { Mic, MicOff, Volume2, VolumeX, LogOut, MessageSquare } from 'lucide-react';
import './App.css';

const App: React.FC = () => {
  const [mood, setMood] = useState<Mood>('happy');
  const [inputValue, setInputValue] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [showMusicNotes, setShowMusicNotes] = useState<boolean>(false);
  const [isStarted, setIsStarted] = useState<boolean>(false);  // Track if user clicked start
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState<boolean>(false);  // Track if audio needs unlock
  const [showHistory, setShowHistory] = useState<boolean>(false);  // Show conversation history
  const [currentUser, setCurrentUser] = useState<User | null>(null);  // Current logged in user
  const inputRef = useRef<HTMLInputElement>(null);
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
    isSupported: sttSupported
  } = useSpeechRecognition();

  // Check for existing user on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
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

  // OPTIMIZATION: Preload common TTS phrases after greeting completes
  useEffect(() => {
    if (isStarted) {
      // Wait 3 seconds after start to not interfere with greeting
      const preloadTimer = setTimeout(() => {
        console.log('🔄 Starting TTS preload...');
        preloadCommonPhrases().catch(err => 
          console.log('⚠️ TTS preloading failed (non-critical):', err)
        );
      }, 3000);

      return () => clearTimeout(preloadTimer);
    }
  }, [isStarted]);

  // OPTIMIZED: Send message to BMO with parallel TTS generation
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

      // OPTIMIZATION: sendMessageToClaude now trims internally to 4 messages
      // No need to trim here - let the API layer handle it for better cache hits
      const bmoResponse = await sendMessageToClaude(newHistory, currentUser?.id);

      // Extract emotes and clean text for speech
      const { cleanText, emotes } = extractEmotes(bmoResponse);

      // OPTIMIZATION: Start TTS generation IMMEDIATELY (don't await yet)
      // This parallelizes the TTS request with UI updates and emote animations
      const ttsPromise = (voiceEnabled && ttsSupported) 
        ? speak(cleanText) 
        : Promise.resolve();

      // Update conversation history with FULL response (including emotes)
      const updatedHistory: Message[] = [
        ...newHistory,
        { role: 'assistant', content: bmoResponse }
      ];
      setConversationHistory(updatedHistory);

      // Save to user's conversation history if logged in
      if (currentUser) {
        addMessageToHistory(currentUser.id, 'user', userMessage);
        addMessageToHistory(currentUser.id, 'assistant', bmoResponse);
      }
      
      // Show response immediately (don't wait for TTS)
      setIsTyping(false);
      
      // Play receive sound
      soundEffects.playReceive();
      
      // OPTIMIZATION: Play emotes while TTS is loading in background
      // By the time emotes finish, TTS should be ready or close
      if (emotes.length > 0) {
        await playEmoteSequence(emotes);
      }
      
      // Now wait for TTS to complete (if it hasn't already)
      // This usually completes during emote sequence, so there's minimal wait
      await ttsPromise;
      
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
      if (voiceEnabled && ttsSupported) {
        speak(errorMsg);
      }
      setMood('sad');
    }
  }, [conversationHistory, voiceEnabled, ttsSupported, speak, currentUser]);

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

  // Handle sending message
  const handleSendMessage = () => {
    if (inputValue.trim() === '' || isTyping) return;
    
    const userMessage = inputValue.trim();
    setInputValue('');
    
    // Play send sound
    soundEffects.playSend();
    
    sendToBMO(userMessage);
  };

  // Handle key press (Enter to send)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isTyping && inputValue.trim() !== '') {
      handleSendMessage();
    }
  };

  // Toggle voice listening
  const toggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      // Stop any ongoing speech before listening
      if (isSpeaking) {
        stopSpeaking();
      }
      await startListening();
    }
  };

  // Toggle voice output
  const toggleVoice = () => {
    const newVoiceState = !voiceEnabled;
    setVoiceEnabled(newVoiceState);
    
    // Save preference if user is logged in
    if (currentUser) {
      const userData = loadUserData(currentUser.id);
      if (userData) {
        userData.preferences.voiceEnabled = newVoiceState;
        localStorage.setItem(`bmo_user_${currentUser.id}`, JSON.stringify(userData));
      }
    }
    
    // Stop speaking if disabling voice
    if (!newVoiceState && isSpeaking) {
      stopSpeaking();
    }
  };

  // Ask for story
  const askForStory = () => {
    const randomPrompt = STORY_PROMPTS[Math.floor(Math.random() * STORY_PROMPTS.length)];
    setInputValue(randomPrompt);
    sendToBMO(randomPrompt);
    soundEffects.playSend();
  };

  // Handle user login
  const handleLogin = (name: string) => {
    const user = createUser(name);
    setCurrentUser(user);
    console.log('👤 User logged in:', user.name);
    
    // Initialize audio after user interaction
    handleStart();
  };

  // Handle user logout
  const handleLogout = () => {
    if (currentUser) {
      logout();
      setCurrentUser(null);
      setConversationHistory([]);
      console.log('👤 User logged out');
    }
  };

  // Start BMO (requires user interaction for audio)
  const handleStart = async () => {
    try {
      console.log('🎮 Starting BMO...');
      
      // CRITICAL: Prewarm audio elements during user gesture
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
      setShowMusicNotes(false);
      setMood('happy');
    } catch (error) {
      console.error('Manual greeting retry failed:', error);
      setNeedsAudioUnlock(true);
      setShowMusicNotes(false);
      setMood('sad');
    }
  };

  // Toggle conversation history
  const toggleHistory = () => {
    setShowHistory(!showHistory);
  };

  // Clear conversation history
  const handleClearHistory = () => {
    if (currentUser && window.confirm('Clear all conversation history? This cannot be undone.')) {
      clearConversationHistory(currentUser.id);
      setConversationHistory([]);
      console.log('🗑️ Conversation history cleared');
    }
  };

  // Show login screen if not started
  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-[#8ee4d4] via-[#5dcdce] to-[#4fb8b9] flex items-center justify-center p-4 font-sans"
      onClick={handleGlobalClick}
    >
      {/* Floating music notes animation */}
      {showMusicNotes && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-float-note text-4xl opacity-80"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${i * 0.3}s`,
                animationDuration: `${3 + Math.random() * 2}s`
              }}
            >
              ♪
            </div>
          ))}
        </div>
      )}

      {/* Conversation History Modal */}
      {showHistory && (
        <ConversationHistory
          messages={currentUser ? getConversationHistory(currentUser.id) : []}
          onClear={handleClearHistory}
        />
      )}

      <div className="max-w-md w-full">
        {/* BMO Body */}
        <div className="bg-gradient-to-b from-[#5dcdce] to-[#4fb8b9] rounded-3xl p-8 shadow-2xl border-8 border-[#2d6d6e] relative overflow-hidden">
          
          {/* Top indicator lights */}
          <div className="absolute top-3 right-3 flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
          </div>

          {/* User info and logout */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="text-[#1a5f7a] font-press-start text-[8px] bg-white/80 px-2 py-1 rounded">
              {currentUser.name}
            </div>
            <button
              onClick={toggleHistory}
              className="text-[#1a5f7a] hover:text-[#0a3d3f] transition-colors"
              title="View history"
            >
              <MessageSquare size={16} />
            </button>
            <button
              onClick={handleLogout}
              className="text-[#1a5f7a] hover:text-red-600 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Screen area */}
          <div className="bg-gradient-to-br from-[#8ee4d4] to-[#5dcdce] rounded-2xl p-6 mb-6 shadow-[inset_0_4px_12px_rgba(0,0,0,0.2)] border-4 border-[#2d6d6e] min-h-[280px] flex flex-col">
            
            {/* BMO's Face */}
            <div className="flex-1 flex items-center justify-center mb-4">
              <BMOFace mood={mood} isSpeaking={isSpeaking} isListening={isListening} />
            </div>

            {/* Mood text */}
            <div className="text-center">
              <p className="text-[#1a5f7a] font-press-start text-xs">
                {MOOD_TEXTS[mood]}
              </p>
            </div>

            {/* Audio unlock banner */}
            {needsAudioUnlock && (
              <div className="mt-3 p-2 bg-yellow-100/90 border-2 border-yellow-400 rounded-lg">
                <p className="text-xs text-yellow-800 font-bold text-center mb-1">
                  🔊 Tap to enable audio
                </p>
                <button
                  onClick={retryGreeting}
                  className="w-full text-xs bg-yellow-500 text-white py-1 px-2 rounded font-bold hover:bg-yellow-600 transition-colors"
                >
                  Enable Sound
                </button>
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
            {sttSupported && (
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
            
            {ttsSupported && (
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
