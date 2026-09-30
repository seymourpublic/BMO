import React, { useCallback, useRef, useState } from 'react';
import { Mood } from '../types';
import { soundEffects } from '../utils/sounds';
import { RpsResult } from '../hooks/useMemory';

export type Hand = 'rock' | 'paper' | 'scissors';
type Phase = 'choose' | 'counting' | 'reveal';

// D-pad picks: left = rock, up = paper, right = scissors
export const HAND_FOR_DIRECTION: Partial<Record<string, Hand>> = { left: 'rock', up: 'paper', right: 'scissors' };

const BEATS: Record<Hand, Hand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const HANDS: Hand[] = ['rock', 'paper', 'scissors'];
const COUNT_WORDS = ['Rock…', 'Paper…', 'Scissors…'];
const COUNT_BEAT_MS = 350;

const REACTIONS: Record<RpsResult, { mood: Mood; lines: string[] }> = {
  friend: {
    mood: 'surprised',
    lines: [
      'No fair! BMO demands a rematch!',
      'You are too good at this, friend!',
      "BMO's circuits are in shock!",
      "BMO is not crying. BMO's screen is just sweating."
    ]
  },
  bmo: {
    mood: 'excited',
    lines: [
      'BMO wins! BMO is champion of the universe!',
      'Hehe! BMO knew you would pick that!',
      'Victory for BMO! Football saw everything!',
      'Better luck next time, friend!'
    ]
  },
  ties: {
    mood: 'happy',
    lines: [
      'We think the same! Are you secretly Football?',
      'A tie! Again, again!',
      'Great minds, friend!'
    ]
  }
};

const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const judge = (friend: Hand, bmo: Hand): RpsResult =>
  friend === bmo ? 'ties' : BEATS[friend] === bmo ? 'friend' : 'bmo';

interface GameOptions {
  onResult: (result: RpsResult, line: string, mood: Mood) => void;
}

export const useRockPaperScissors = ({ onResult }: GameOptions) => {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('choose');
  const [countIndex, setCountIndex] = useState(0);
  const [friendHand, setFriendHand] = useState<Hand | null>(null);
  const [bmoHand, setBmoHand] = useState<Hand | null>(null);
  const [result, setResult] = useState<RpsResult | null>(null);
  const roundRef = useRef(0);  // Cancels a countdown if the game is quit mid-round

  const start = useCallback(() => {
    roundRef.current++;
    setActive(true);
    setPhase('choose');
    setFriendHand(null);
    setBmoHand(null);
    setResult(null);
    soundEffects.playButtonClick();
  }, []);

  const quit = useCallback(() => {
    roundRef.current++;
    setActive(false);
  }, []);

  const pick = useCallback(async (hand: Hand) => {
    if (!active || phase !== 'choose') return;
    const round = roundRef.current;
    setFriendHand(hand);
    setPhase('counting');

    for (let i = 0; i < COUNT_WORDS.length; i++) {
      setCountIndex(i);
      soundEffects.playButtonClick();
      await wait(COUNT_BEAT_MS);
      if (round !== roundRef.current) return;
    }

    const bmo = pickRandom(HANDS);
    const outcome = judge(hand, bmo);
    setBmoHand(bmo);
    setResult(outcome);
    setPhase('reveal');
    soundEffects.playEmote(outcome === 'bmo' ? 'excited' : outcome === 'friend' ? 'sad' : 'happy');
    const reaction = REACTIONS[outcome];
    onResult(outcome, pickRandom(reaction.lines), reaction.mood);
  }, [active, phase, onResult]);

  return { active, phase, countIndex, friendHand, bmoHand, result, start, quit, pick };
};

// Simple hand drawings in BMO's face style
const HandIcon: React.FC<{ hand: Hand; color: string }> = ({ hand, color }) => (
  <svg viewBox="0 0 40 40" className="w-full h-full" aria-label={hand}>
    {hand === 'rock' && (
      <>
        <rect x="9" y="12" width="22" height="18" rx="8" fill={color} />
        <path d="M13 16 v6 M19 15 v7 M25 16 v6" stroke="#ffffff88" strokeWidth="2" strokeLinecap="round" />
      </>
    )}
    {hand === 'paper' && (
      <>
        <rect x="10" y="7" width="20" height="26" rx="2" fill={color} />
        <path d="M14 14 h12 M14 19 h12 M14 24 h8" stroke="#ffffff88" strokeWidth="2" strokeLinecap="round" />
      </>
    )}
    {hand === 'scissors' && (
      <>
        <circle cx="13" cy="29" r="5" fill="none" stroke={color} strokeWidth="3" />
        <circle cx="27" cy="29" r="5" fill="none" stroke={color} strokeWidth="3" />
        <path d="M15 25 L26 6 M25 25 L14 6" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
      </>
    )}
  </svg>
);

interface ScreenProps {
  game: ReturnType<typeof useRockPaperScissors>;
  score: { friend: number; bmo: number; ties: number };
  color: string;
  friendName: string;
  reaction: string;  // BMO's line after a round
}

// What BMO's screen shows during the game
export const RockPaperScissorsScreen: React.FC<ScreenProps> = ({ game, score, color, friendName, reaction }) => {
  const you = friendName || 'Friend';
  const headline = game.phase === 'choose' ? 'Rock Paper Scissors!'
    : game.phase === 'counting' ? COUNT_WORDS[game.countIndex]
    : game.result === 'friend' ? `${you} wins!` : game.result === 'bmo' ? 'BMO wins!' : 'Tie!';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between p-[5%] text-center" style={{ color }}>
      <div className="text-[clamp(11px,3.2vw,13px)] font-semibold opacity-80">
        {you} {score.friend} · BMO {score.bmo}{score.ties ? ` · Ties ${score.ties}` : ''}
      </div>

      <div aria-live="polite">
        <div className="text-[clamp(16px,5vw,22px)] font-extrabold">{headline}</div>
        {reaction && <div className="text-[clamp(11px,3.2vw,13px)] mt-1">{reaction}</div>}
      </div>

      {game.phase === 'choose' ? (
        <div className="grid grid-cols-3 gap-2 w-full text-[clamp(10px,3vw,12px)] font-semibold">
          {(['rock', 'paper', 'scissors'] as Hand[]).map((hand, i) => (
            <div key={hand} className="flex flex-col items-center">
              <div className="w-[60%] aspect-square"><HandIcon hand={hand} color={color} /></div>
              <span>{['◀', '▲', '▶'][i]} {hand}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 w-[80%] text-[clamp(10px,3vw,12px)] font-semibold">
          {[[you, game.friendHand], ['BMO', game.phase === 'reveal' ? game.bmoHand : null]].map(([label, hand]) => (
            <div key={label as string} className="flex flex-col items-center">
              <div className={`w-[58%] aspect-square ${hand ? '' : 'animate-pulse'}`}>
                {hand ? <HandIcon hand={hand as Hand} color={color} /> : <HandIcon hand="rock" color={color} />}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-[clamp(10px,3vw,12px)] opacity-70">
        {game.phase === 'reveal' ? '▲ triangle: again · ● red: stop' : game.phase === 'choose' ? '● red: stop' : ' '}
      </div>
    </div>
  );
};
