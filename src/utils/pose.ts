import { Mood } from '../types';

// How BMO's arms, legs and body move
export type Pose = 'wave' | 'bounce' | 'droop' | 'surprise' | 'talk' | 'dance' | 'sway' | 'sleep';

interface PoseState {
  dancing: boolean;
  waving: boolean;
  asleep: boolean;
  speaking: boolean;
  mood: Mood;
}

const HAPPY_MOODS: Mood[] = ['excited', 'starry', 'love'];
const DOWN_MOODS: Mood[] = ['sad', 'crying'];

// Pick the pose from what BMO is doing; earlier rules win
export const poseFor = ({ dancing, waving, asleep, speaking, mood }: PoseState): Pose => {
  if (dancing) return 'dance';
  if (waving) return 'wave';
  if (asleep) return 'sleep';
  if (mood === 'surprised') return 'surprise';
  if (DOWN_MOODS.includes(mood)) return 'droop';
  if (speaking) return 'talk';
  if (HAPPY_MOODS.includes(mood)) return 'bounce';
  return 'sway';
};
