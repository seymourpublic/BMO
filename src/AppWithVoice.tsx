import React, { useState, useEffect, useRef } from 'react';
import { BMOFace } from './components/BMOFaceWithVoice';
import { ChatMessage } from './components/ChatMessage';
import { sendMessageToClaude } from './utils/api';
import { MOOD_TEXTS, STORY_PROMPTS } from './utils/constants';
import { Message, Mood } from './types';
import { useSpeech } from './hooks/useSpeech';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import './App.css';

const App: React.FC = () => {
  const [mood, setMood] = useState<Mood>('happy');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello friend! BMO is so happy to see you! Do you want to play video games? Or maybe talk about my friend Football? I am a real living boy... or girl... or console. BMO is everything!'
    }
  ]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const chatDisplayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice hooks
  const { speak, isSpeaking, stop: stopSpeaking, isSupported: ttsSupported } = useSpeech();
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    isSupported: sttSupported,
    error: speechError
  } = useSpeechRecognition();

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatDisplayRef.current) {
      chatDisplayRef.current.scrollTop = chatDisplayRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle completed voice transcript
  useEffect(() => {
    if (transcript && !isListening) {
      setInputValue(transcript);
      resetTranscript();
    }
  }, [transcript, isListening, resetTranscript]);

  // Send message to BMO
  const sendToBMO = async (userMessage: string) => {
    try {
      setIsTyping(true);
      setMood('thinking');

      // Add user message to history
      const newHistory: Message[] = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      // Get BMO's response
      const bmoResponse = await sendMessageToClaude(newHistory);

      // Update conversation history
      const updatedHistory: Message[] = [
        ...newHistory,
        { role: 'assistant', content: bmoResponse }
      ];
      setConversationHistory(updatedHistory);

      // Add BMO's response to messages
      setMessages(prev => [...prev, { role: 'assistant', content: bmoResponse }]);
      
      setIsTyping(false);
      
      // Speak the response if voice is enabled
      if (voiceEnabled && ttsSupported) {
        speak(bmoResponse);
      }
      
      // Randomly change mood after responding
      const moods: Mood[] = ['happy', 'excited', 'surprised'];
      const randomMood = moods[Math.floor(Math.random() * moods.length)];
      setTimeout(() => setMood(randomMood), 500);

    } catch (error) {
      setIsTyping(false);
      console.error('Error talking to BMO:', error);
      const errorMsg = "Oh no! BMO's circuits got confused! BMO needs a moment...";
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMsg
      }]);
      if (voiceEnabled && ttsSupported) {
        speak(errorMsg);
      }
      setMood('sad');
    }
  };

  // Handle sending message
  const handleSendMessage = () => {
    if (inputValue.trim() === '' || isTyping) return;
    
    const userMessage = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
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
    setMessages(prev => [...prev, { role: 'user', content: randomPrompt }]);
    sendToBMO(randomPrompt);
  };

  // Toggle voice input
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Toggle voice output
  const toggleVoice = () => {
    if (voiceEnabled) {
      stopSpeaking();
    }
    setVoiceEnabled(!voiceEnabled);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a5f7a] via-[#2d8a9e] to-[#57c4d8] flex items-center justify-center p-5 relative overflow-hidden font-orbitron">
      {/* Animated background particles */}
      <div className="fixed inset-0 opacity-20 pointer-events-none animate-float">
        <div className="absolute w-2 h-2 bg-white rounded-full top-[20%] left-[20%]" />
        <div className="absolute w-2 h-2 bg-white rounded-full top-[80%] left-[80%]" />
        <div className="absolute w-2 h-2 bg-white rounded-full top-[40%] left-[60%]" />
      </div>

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
            
            {/* Chat Display */}
            <div 
              ref={chatDisplayRef}
              className="bg-white/90 rounded-lg p-3 mt-3 max-h-[250px] overflow-y-auto text-[13px] leading-relaxed custom-scrollbar"
            >
              {messages.map((msg, index) => (
                <ChatMessage 
                  key={index} 
                  sender={msg.role === 'user' ? 'user' : 'bmo'} 
                  content={msg.content} 
                />
              ))}
            </div>
            
            {/* Typing Indicator */}
            {isTyping && (
              <div className="text-[#4fb8b9] italic text-xs mt-2 animate-pulse">
                BMO is thinking...
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

          {/* Control Buttons */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <button
              onClick={() => setMood('happy')}
              className="btn-retro"
            >
              Happy
            </button>
            <button
              onClick={() => setMood('excited')}
              className="btn-retro"
            >
              Excited
            </button>
            <button
              onClick={() => setMood('thinking')}
              className="btn-retro"
            >
              Think
            </button>
            <button
              onClick={askForStory}
              className="col-span-3 btn-retro-primary"
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
