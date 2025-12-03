import React from 'react';
import { Mood } from '../types';

interface BMOFaceProps {
  mood: Mood;
  isSpeaking?: boolean;
  isListening?: boolean;
}

export const BMOFace: React.FC<BMOFaceProps> = ({ mood, isSpeaking = false, isListening = false }) => {
  // Eye configurations for different moods
  const eyeConfigs = {
    happy: { leftY: 35, rightY: 35, size: 16 },
    excited: { leftY: 30, rightY: 30, size: 20 },
    thinking: { leftY: 38, rightY: 35, size: 14 },
    sad: { leftY: 40, rightY: 40, size: 14 },
    surprised: { leftY: 28, rightY: 28, size: 22 }
  };

  // Mouth configurations for different moods
  const mouthConfigs = {
    happy: { type: 'smile', width: 80, height: 25, y: 70 },
    excited: { type: 'bigSmile', width: 90, height: 35, y: 68 },
    thinking: { type: 'line', width: 60, height: 3, y: 75 },
    sad: { type: 'frown', width: 70, height: 25, y: 75 },
    surprised: { type: 'oval', width: 35, height: 45, y: 70 }
  };

  // Override mood when speaking or listening
  const activeMood = isSpeaking ? 'excited' : isListening ? 'surprised' : mood;
  const eyeConfig = eyeConfigs[activeMood];
  const mouthConfig = mouthConfigs[activeMood];

  const renderMouth = () => {
    const { type, width, height, y } = mouthConfig;

    // Add animation when speaking
    const animationClass = isSpeaking ? 'animate-pulse' : '';

    switch (type) {
      case 'smile':
        return (
          <path
            d={`M ${(120 - width) / 2} ${y} Q ${120 / 2} ${y + height} ${(120 + width) / 2} ${y}`}
            stroke="#0a3d3f"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            className={`transition-all duration-500 ${animationClass}`}
          />
        );
      case 'bigSmile':
        return (
          <path
            d={`M ${(120 - width) / 2} ${y} Q ${120 / 2} ${y + height} ${(120 + width) / 2} ${y}`}
            stroke="#0a3d3f"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            className={`transition-all duration-500 ${animationClass}`}
          />
        );
      case 'frown':
        return (
          <path
            d={`M ${(120 - width) / 2} ${y} Q ${120 / 2} ${y - height} ${(120 + width) / 2} ${y}`}
            stroke="#0a3d3f"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            className={`transition-all duration-500 ${animationClass}`}
          />
        );
      case 'line':
        return (
          <rect
            x={(120 - width) / 2}
            y={y}
            width={width}
            height={height}
            rx="2"
            fill="#0a3d3f"
            className={`transition-all duration-500 ${animationClass}`}
          />
        );
      case 'oval':
        return (
          <ellipse
            cx={120 / 2}
            cy={y + height / 2}
            rx={width / 2}
            ry={height / 2}
            fill="none"
            stroke="#0a3d3f"
            strokeWidth="5"
            className={`transition-all duration-500 ${animationClass}`}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative mx-auto w-[180px] h-[140px]">
      <svg
        viewBox="0 0 120 100"
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
      >
        {/* Left Eye */}
        <g className="transition-all duration-500">
          <circle
            cx="35"
            cy={eyeConfig.leftY}
            r={eyeConfig.size / 2}
            fill="#0a3d3f"
            className="animate-blink"
          />
          {/* Eye shine/reflection */}
          <circle
            cx="37"
            cy={eyeConfig.leftY - 2}
            r={eyeConfig.size / 5}
            fill="rgba(142, 228, 212, 0.6)"
          />
        </g>

        {/* Right Eye */}
        <g className="transition-all duration-500">
          <circle
            cx="85"
            cy={eyeConfig.rightY}
            r={eyeConfig.size / 2}
            fill="#0a3d3f"
            className="animate-blink"
          />
          {/* Eye shine/reflection */}
          <circle
            cx="87"
            cy={eyeConfig.rightY - 2}
            r={eyeConfig.size / 5}
            fill="rgba(142, 228, 212, 0.6)"
          />
        </g>

        {/* Mouth */}
        <g className="transition-all duration-500">
          {renderMouth()}
        </g>

        {/* Cheeks when excited or speaking */}
        {(activeMood === 'excited' || isSpeaking) && (
          <>
            <ellipse
              cx="25"
              cy="55"
              rx="8"
              ry="6"
              fill="rgba(243, 156, 18, 0.3)"
              className="animate-pulse"
            />
            <ellipse
              cx="95"
              cy="55"
              rx="8"
              ry="6"
              fill="rgba(243, 156, 18, 0.3)"
              className="animate-pulse"
            />
          </>
        )}

        {/* Listening indicator - sound waves */}
        {isListening && (
          <g className="animate-pulse">
            <circle cx="10" cy="50" r="2" fill="#0a3d3f" opacity="0.5" />
            <circle cx="110" cy="50" r="2" fill="#0a3d3f" opacity="0.5" />
            <circle cx="8" cy="45" r="1.5" fill="#0a3d3f" opacity="0.3" />
            <circle cx="112" cy="45" r="1.5" fill="#0a3d3f" opacity="0.3" />
            <circle cx="6" cy="55" r="1.5" fill="#0a3d3f" opacity="0.3" />
            <circle cx="114" cy="55" r="1.5" fill="#0a3d3f" opacity="0.3" />
          </g>
        )}

        {/* Thinking indicator - thought bubble */}
        {activeMood === 'thinking' && !isSpeaking && !isListening && (
          <g className="animate-bounce-slow">
            <circle cx="100" cy="20" r="3" fill="#0a3d3f" opacity="0.4" />
            <circle cx="105" cy="15" r="2" fill="#0a3d3f" opacity="0.3" />
            <circle cx="110" cy="12" r="1.5" fill="#0a3d3f" opacity="0.2" />
          </g>
        )}
      </svg>

      {/* Controller buttons below the face */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
        <div className={`w-3 h-3 rounded-full bg-[#2d6d6e] border-2 border-[#0a3d3f] shadow-inner ${isSpeaking ? 'animate-pulse' : ''}`} />
        <div className={`w-3 h-3 rounded-full bg-[#2d6d6e] border-2 border-[#0a3d3f] shadow-inner ${isListening ? 'animate-pulse' : ''}`} />
      </div>
    </div>
  );
};
