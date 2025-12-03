import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BMOFace } from './components/BMOFace';
import { sendMessageToClaude } from './utils/api';
import { MOOD_TEXTS, STORY_PROMPTS } from './utils/constants';
import { Message, Mood } from './types';
import { useFishAudio } from './hooks/useFishAudio';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { soundEffects } from './utils/sounds';
import { bmoSongs, SPECIAL_SONG_LYRICS, SPECIAL_SONG_TRIGGERS } from './utils/songs';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import './App.css';

const App: React.FC = () => {
  const [mood, setMood] = useState<Mood>('happy');
  const [inputValue, setInputValue] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [showMusicNotes, setShowMusicNotes] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice hooks - Fish Audio with actual BMO voice!
  // API key is on backend now (no CORS issues!)
  const { 
    speak, 
    isSpeaking, 
    stop: stopSpeaking, 
    isSupported: ttsSupported,
    error: voiceError
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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Play greeting song on first load
  useEffect(() => {
    const playGreeting = async () => {
      // Wait a moment for everything to load
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Show music notes
      setShowMusicNotes(true);
      
      // Play the melody first
      setMood('excited');
      await bmoSongs.playHelloFriendMelody();
      
      // Then speak "Hello friend!" with singing voice
      if (ttsSupported) {
        await speak("♪ Hello friend! ♪");
      }
      
      setMood('happy');
      setShowMusicNotes(false);
    };
    
    playGreeting();
  }, []); // Empty deps = only on mount

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
      
      // Speak the CLEAN response (without asterisks)
      if (voiceEnabled && ttsSupported) {
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
      if (voiceEnabled && ttsSupported) {
        speak(errorMsg);
      }
      setMood('sad');
    }
  }, [conversationHistory, voiceEnabled, ttsSupported, speak]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a5f7a] via-[#2d8a9e] to-[#57c4d8] flex items-center justify-center p-5 relative overflow-hidden font-orbitron">
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
          <div className="bg-gradient-to-b from-[#8ee4d4] to-[#6dd4c4] rounded-2xl p-5 mb-6 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)] min-h-[200px] relative overflow-hidden border-4 border-[#3fa4a5]">
            {/* Scanline effect */}
            <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.03)_0px,rgba(0,0,0,0.03)_2px,transparent_2px,transparent_4px)] animate-scanline" />
            
            {/* Screen reflection overlay */}
            <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-t-2xl" />
            
            {/* Pixel Face with voice animations */}
            <BMOFace mood={mood} isSpeaking={isSpeaking} isListening={isListening} />
            
            {/* Mood Indicator */}
            <div className="text-center mt-2 font-press-start text-[8px] text-[#2a5d5f] uppercase tracking-wider">
              {isListening ? '🎤 LISTENING...' : isSpeaking ? '🔊 SPEAKING...' : MOOD_TEXTS[mood]}
            </div>
            
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
          {voiceError && (
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
