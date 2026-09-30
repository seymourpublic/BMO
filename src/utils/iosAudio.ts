// iOS Audio Helper
// Handles iOS-specific audio quirks and restrictions

export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

// Unlock iOS audio - must be called during user interaction
export const unlockIOSAudio = async () => {
  if (!isIOS()) return true;
  
  try {
    // Create a temporary audio context
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    
    // Play silent sound to unlock
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    
    // Resume if suspended
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    console.log('🍎 iOS audio unlocked');
    return true;
  } catch (error) {
    console.error('Failed to unlock iOS audio:', error);
    return false;
  }
};

