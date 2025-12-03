import React, { useState } from 'react';
import { Zap, Star, Sparkles } from 'lucide-react';

export type VoiceMode = 'browser' | 'enhanced' | 'elevenlabs';

interface VoiceModeSelecterProps {
  currentMode: VoiceMode;
  onModeChange: (mode: VoiceMode) => void;
  elevenLabsAvailable: boolean;
}

export const VoiceModeSelector: React.FC<VoiceModeSelecterProps> = ({
  currentMode,
  onModeChange,
  elevenLabsAvailable
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const modes = [
    {
      id: 'browser' as VoiceMode,
      name: 'Browser',
      icon: Zap,
      description: 'Built-in voice (Free)',
      quality: '★★★☆☆',
      available: true
    },
    {
      id: 'enhanced' as VoiceMode,
      name: 'Enhanced',
      icon: Star,
      description: 'Improved prosody (Free)',
      quality: '★★★★☆',
      available: true
    },
    {
      id: 'elevenlabs' as VoiceMode,
      name: 'Natural AI',
      icon: Sparkles,
      description: 'ElevenLabs API (Premium)',
      quality: '★★★★★',
      available: elevenLabsAvailable
    }
  ];

  const currentModeData = modes.find(m => m.id === currentMode);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-2 px-3 rounded-lg font-press-start text-[8px] bg-gradient-to-b from-[#3498db] to-[#2980b9] text-white shadow-[0_4px_0_#1f5f8b] hover:-translate-y-0.5 active:translate-y-0.5 uppercase transition-all"
      >
        {currentModeData && <currentModeData.icon size={14} />}
        Mode
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-2xl p-4 w-80 z-50 border-4 border-[#3fa4a5]">
          <h3 className="font-press-start text-xs text-[#1a5f7a] mb-3">Voice Mode</h3>
          
          <div className="space-y-2">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = currentMode === mode.id;
              const isAvailable = mode.available;

              return (
                <button
                  key={mode.id}
                  onClick={() => {
                    if (isAvailable) {
                      onModeChange(mode.id);
                      setIsOpen(false);
                    }
                  }}
                  disabled={!isAvailable}
                  className={`w-full p-3 rounded-lg text-left transition-all ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#5dcdce] to-[#4fb8b9] text-white'
                      : isAvailable
                      ? 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                  } ${!isAvailable ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon size={20} className={`mt-1 ${isSelected ? 'text-white' : 'text-[#3498db]'}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">{mode.name}</span>
                        <span className="text-xs">{mode.quality}</span>
                      </div>
                      <p className="text-xs opacity-90">{mode.description}</p>
                      {!isAvailable && mode.id === 'elevenlabs' && (
                        <p className="text-xs mt-1 text-red-600">
                          Add API key in .env to enable
                        </p>
                      )}
                      {isSelected && (
                        <p className="text-xs mt-1 font-bold">✓ Active</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info Box */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-[10px] text-blue-800">
              <strong>💡 Tip:</strong> "Natural AI" mode uses ElevenLabs for ultra-realistic voice. 
              Requires API key (see docs for setup).
            </p>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="mt-3 w-full text-[8px] py-2 rounded bg-[#e74c3c] text-white font-bold hover:bg-[#c0392b] transition-all"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
