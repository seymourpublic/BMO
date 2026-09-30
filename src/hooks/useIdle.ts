import { useCallback, useEffect, useRef, useState } from 'react';

export type IdleAction = 'look' | 'hum' | 'blink' | 'football';

// How long before BMO starts doing idle things, and how often after that
const FIRST_ACTION_MS = 20_000;
const MIN_GAP_MS = 15_000;
const MAX_GAP_MS = 30_000;
// How long before BMO dozes off
const DOZE_AFTER_MS = 3 * 60_000;

const ACTIONS: IdleAction[] = ['look', 'hum', 'blink', 'football'];

interface Options {
  enabled: boolean;  // Awake and not busy (listening, talking, game, panel...)
  onAction: (action: IdleAction) => void;
  onDoze: () => void;
}

// BMO's life while nobody is talking to it. Call `bump()` on any interaction.
export const useIdle = ({ enabled, onAction, onDoze }: Options) => {
  const [activity, setActivity] = useState(0);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const onDozeRef = useRef(onDoze);
  onDozeRef.current = onDoze;

  const bump = useCallback(() => setActivity(a => a + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let actionTimer = 0;
    let lastAction: IdleAction | null = null;

    const scheduleAction = (delay: number) => {
      actionTimer = window.setTimeout(() => {
        // Avoid doing the same thing twice in a row
        const options = ACTIONS.filter(a => a !== lastAction);
        lastAction = options[Math.floor(Math.random() * options.length)];
        onActionRef.current(lastAction);
        scheduleAction(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
      }, delay);
    };

    scheduleAction(FIRST_ACTION_MS);
    const dozeTimer = window.setTimeout(() => onDozeRef.current(), DOZE_AFTER_MS);

    return () => {
      clearTimeout(actionTimer);
      clearTimeout(dozeTimer);
    };
  }, [enabled, activity]);

  return { bump };
};
