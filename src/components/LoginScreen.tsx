import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: (name: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    
    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    
    if (trimmedName.length > 30) {
      setError('Name must be less than 30 characters');
      return;
    }
    
    onLogin(trimmedName);
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#1a5f7a] via-[#2d8a9e] to-[#57c4d8] flex items-center justify-center z-50 p-5">
      <div className="text-center space-y-8 max-w-md w-full px-6 animate-fade-in">
        {/* BMO Animation */}
        <div className="relative">
          <div className="text-9xl animate-bounce-slow">🎮</div>
          <div className="absolute -inset-4 bg-[#8ee4d4]/20 rounded-full blur-xl animate-pulse" />
        </div>
        
        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-6xl font-press-start text-white mb-3 drop-shadow-[0_0_20px_rgba(142,228,212,0.5)]">
            BMO
          </h1>
          <p className="text-base text-[#8ee4d4] font-press-start text-xs leading-relaxed">
            Your AI Friend from Adventure Time
          </p>
        </div>
        
        {/* Login Form */}
        <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-6 border-2 border-[#8ee4d4]/30">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white font-press-start text-xs mb-3">
                What's your name?
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-[#2d6d6e] border-2 border-[#4fb8b9] rounded-lg text-white placeholder-[#8ee4d4]/50 font-orbitron focus:outline-none focus:border-[#8ee4d4] transition-colors"
                maxLength={30}
                autoFocus
              />
              {error && (
                <p className="text-red-300 text-xs mt-2">{error}</p>
              )}
            </div>
            
            <button
              type="submit"
              className="group w-full py-4 px-8 bg-gradient-to-br from-[#2ecc71] via-[#27ae60] to-[#229954] text-white rounded-2xl font-press-start text-base shadow-[0_8px_0_#1e8449] hover:shadow-[0_6px_0_#1e8449] hover:translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_#1e8449] transition-all duration-150 uppercase border-2 border-[#27ae60] hover:border-[#2ecc71] relative overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                <span className="text-2xl group-hover:animate-bounce">👋</span>
                <span>Meet BMO!</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
            </button>
          </form>
          
          <div className="mt-4 pt-4 border-t border-[#8ee4d4]/20">
            <p className="text-[#8ee4d4] text-xs text-center">
              BMO will remember your conversations! 💾
            </p>
          </div>
        </div>
        
        {/* Footer */}
        <div className="space-y-2">
          <p className="text-[#8ee4d4] text-xs opacity-90 flex items-center justify-center gap-2">
            <span>🎵</span>
            <span>Voice & Text Chat Available</span>
            <span>🎵</span>
          </p>
        </div>
      </div>
    </div>
  );
};
