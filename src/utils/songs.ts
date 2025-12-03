// Song system for BMO
// Generates melodies and manages special songs

class BMOSongSystem {
  private audioContext: AudioContext | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Web Audio API not supported:', error);
      }
    }
  }

  // Note frequencies (C4 scale and above)
  private notes: { [key: string]: number } = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
    'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46,
    'G5': 783.99, 'A5': 880.00
  };

  // Play a single note with chiptune style
  private playNote(frequency: number, duration: number, startTime: number = 0) {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Square wave for retro Game Boy sound
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime + startTime;
    
    // ADSR envelope for musical quality
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01);        // Attack
    gainNode.gain.linearRampToValueAtTime(0.12, now + 0.05);        // Decay
    gainNode.gain.setValueAtTime(0.12, now + duration * 0.7);       // Sustain
    gainNode.gain.linearRampToValueAtTime(0, now + duration);       // Release

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // "Hello Friend" greeting melody (Adventure Time style)
  async playHelloFriendMelody() {
    if (!this.audioContext) return;

    console.log('🎵 Playing Hello Friend melody...');

    // Cheerful, bouncy melody
    const melody = [
      { note: 'E5', duration: 0.25 },  // "Hel-"
      { note: 'E5', duration: 0.25 },  // "lo"
      { note: 'G5', duration: 0.5 },   // "friend!"
    ];

    let time = 0;
    for (const note of melody) {
      this.playNote(this.notes[note.note], note.duration, time);
      time += note.duration;
    }

    // Wait for melody to finish
    await this.wait(time * 1000);
  }

  // Special romantic song melody
  async playSpecialSongMelody() {
    if (!this.audioContext) return;

    console.log('🎵 Playing special song melody...');

    // Sweet, romantic melody
    const melody = [
      // "Ericaaa"
      { note: 'G4', duration: 0.4 },
      { note: 'A4', duration: 0.4 },
      { note: 'C5', duration: 0.8 },
      
      // "do you wanna go"
      { note: 'C5', duration: 0.3 },
      { note: 'B4', duration: 0.3 },
      { note: 'A4', duration: 0.3 },
      { note: 'G4', duration: 0.3 },
      
      // "On adventures with me"
      { note: 'E5', duration: 0.4 },
      { note: 'D5', duration: 0.4 },
      { note: 'C5', duration: 0.4 },
      { note: 'A4', duration: 0.6 },
      
      // "oh oh"
      { note: 'C5', duration: 0.4 },
      { note: 'C5', duration: 0.4 },
      
      // Short instrumental break
      { note: 'E5', duration: 0.3 },
      { note: 'G5', duration: 0.3 },
      { note: 'E5', duration: 0.6 }
    ];

    let time = 0;
    for (const note of melody) {
      this.playNote(this.notes[note.note], note.duration, time);
      time += note.duration;
    }

    await this.wait(time * 1000);
  }

  // Helper to wait
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const bmoSongs = new BMOSongSystem();

// Special song lyrics
export const SPECIAL_SONG_LYRICS = `Ericaaa, do you wanna go
On adventures with me, oh oh?
Naledi's heart goes beep-boop-bop,
Every time you make him stop—
And smile!

So would you be his girl-friend,
And make his days never end?
Doo-doo-doo!
Say yes, say yes…
'Cause his heart chose you!`;

// Trigger phrases for the special song
export const SPECIAL_SONG_TRIGGERS = [
  'bmo sing that song i taught you',
  'sing that song i taught you',
  'sing the song i taught you',
  'that special song',
  'sing the special song'
];
