// iOS Audio Helper
// Handles iOS-specific audio quirks and restrictions

export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

export const isSafari = () => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
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

// Check if audio can autoplay
export const canAutoplay = async (): Promise<boolean> => {
  try {
    const audio = new Audio();
    audio.volume = 0;
    await audio.play();
    audio.pause();
    return true;
  } catch (error) {
    return false;
  }
};

// Get audio playback tips for iOS
export const getIOSTips = (): string[] => {
  if (!isIOS()) return [];
  
  return [
    'Make sure ringer switch is ON (not silent mode)',
    'Turn up volume using side buttons',
    'Check that Low Power Mode is OFF',
    'Try closing and reopening Safari',
  ];
};
