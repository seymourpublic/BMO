// Message types for chat
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Mood types
export type Mood =
  | 'happy' | 'excited' | 'thinking' | 'sad' | 'surprised' | 'confused'
  | 'love' | 'crying' | 'sleepy' | 'starry' | 'blushing' | 'pouty'
  | 'calm';  // Soft and steady, for hard moments (crisis mode)

