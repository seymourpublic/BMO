import { useCallback, useRef } from 'react';
import { Mood } from '../types';

export interface PokeReaction {
  line: string;
  mood: Mood;
  spoken: boolean;
  sound: 'giggle' | 'surprise' | 'sad';
  batteryLow?: boolean;  // Too many pokes: BMO "shuts down" and bounces back
}

// Pokes further apart than this start the count over
const POKE_RESET_MS = 5000;
// This many pokes in a row flattens BMO's battery
const BATTERY_POKES = 10;

const reactionFor = (count: number): PokeReaction => {
  if (count >= BATTERY_POKES) {
    return { line: 'Battery low... Shutdown.', mood: 'sad', spoken: true, sound: 'sad', batteryLow: true };
  }
  if (count >= 6) {
    // Only spoken the first time, so repeated pokes don't queue up voice lines
    return { line: 'BMO is not a button! ...Well, BMO IS buttons, but still!', mood: 'pouty', spoken: count === 6, sound: 'sad' };
  }
  if (count >= 3) {
    return { line: 'Hey! That tickles!', mood: 'confused', spoken: false, sound: 'surprise' };
  }
  return { line: 'hehe!', mood: 'happy', spoken: false, sound: 'giggle' };
};

// Counts pokes on BMO and escalates the reaction
export const usePokes = () => {
  const countRef = useRef(0);
  const lastPokeRef = useRef(0);

  const poke = useCallback((): PokeReaction => {
    const now = Date.now();
    countRef.current = now - lastPokeRef.current > POKE_RESET_MS ? 1 : countRef.current + 1;
    lastPokeRef.current = now;
    const reaction = reactionFor(countRef.current);
    if (reaction.batteryLow) countRef.current = 0;  // Fresh start after bouncing back
    return reaction;
  }, []);

  return { poke };
};
