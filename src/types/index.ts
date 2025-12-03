// Message types for chat
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Face pattern type
export interface FacePattern {
  [key: string]: number[];
}

// Mood types
export type Mood = 'happy' | 'excited' | 'thinking' | 'sad' | 'surprised' | 'confused';

// BMO API response
export interface BMOResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}
