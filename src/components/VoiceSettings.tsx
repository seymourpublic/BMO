import React, { useState } from 'react';
import { Settings } from 'lucide-react';

interface VoiceSettingsProps {
  onSettingsChange: (pitch: number, rate: number) => void;
  currentPitch: number;
  currentRate: number;
}

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ 
  onSettingsChange, 
  currentPitch, 
  currentRate 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pitch, setPitch] = useState(currentPitch);
  const [rate, setRate] = useState(currentRate);

  const handlePitchChange = (value: number) => {
    setPitch(value);
    onSettingsChange(value, rate);
  };

  const handleRateChange = (value: number) => {
    setRate(value);
    onSettingsChange(pitch, value);
  };

  const presets = [
    { name: 'BMO Show', pitch: 1.8, rate: 1.15 },
    { name: 'Super Cute', pitch: 2.0, rate: 1.2 },
    { name: 'Deep BMO', pitch: 0.8, rate: 0.9 },
    { name: 'Excited', pitch: 1.9, rate: 1.4 },
    { name: 'Calm', pitch: 1.5, rate: 0.8 },
    { name: 'Robot', pitch: 1.0, rate: 1.5 },
  ];

  const applyPreset = (presetPitch: number, presetRate: number) => {
    setPitch(presetPitch);
    setRate(presetRate);
    onSettingsChange(presetPitch, presetRate);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-2 px-3 rounded-lg font-press-start text-[8px] bg-gradient-to-b from-[#95a5a6] to-[#7f8c8d] text-white shadow-[0_4px_0_#5a6c6d] hover:-translate-y-0.5 active:translate-y-0.5 uppercase transition-all"
      >
        <Settings size={14} />
        Voice
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-2xl p-4 w-72 z-50 border-4 border-[#3fa4a5]">
          <h3 className="font-press-start text-xs text-[#1a5f7a] mb-3">Voice Settings</h3>
          
          {/* Pitch Slider */}
          <div className="mb-4">
            <label className="text-xs font-bold text-[#2d6d6e] block mb-2">
              Pitch: {pitch.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={pitch}
              onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#8ee4d4] rounded-lg appearance-none cursor-pointer accent-[#f39c12]"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>Deep</span>
              <span>High</span>
            </div>
          </div>

          {/* Rate Slider */}
          <div className="mb-4">
            <label className="text-xs font-bold text-[#2d6d6e] block mb-2">
              Speed: {rate.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#8ee4d4] rounded-lg appearance-none cursor-pointer accent-[#f39c12]"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Presets */}
          <div className="border-t-2 border-[#8ee4d4] pt-3">
            <p className="text-[10px] font-bold text-[#2d6d6e] mb-2">Presets:</p>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset.pitch, preset.rate)}
                  className="text-[8px] py-2 px-3 rounded bg-gradient-to-b from-[#5dcdce] to-[#4fb8b9] text-white hover:from-[#4fb8b9] hover:to-[#3fa4a5] transition-all shadow-md hover:shadow-lg"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Close Button */}
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
