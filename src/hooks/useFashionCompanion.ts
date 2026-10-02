import { useCallback, useRef, useState } from 'react';
import { Mood } from '../types';
import { FashionShow } from '../components/FashionScreen';
import { CapturedPhoto } from '../components/CameraView';
import { fetchFashion, fetchFinale } from '../utils/api';
import { blobToDataUrl } from '../utils/images';
import { FeatureId } from '../utils/growth';
import { FALLBACK_JUDGING, Look, Outfit, isAccessory, showIsFull, wantsFinale, wantsNextLook } from '../utils/fashion';
import { soundEffects } from '../utils/sounds';

interface Options {
  quickLine: (text: string, mood: Mood, spoken: boolean) => Promise<void>;
  setMood: (mood: Mood) => void;
  interrupt: () => void;
  enterMode: () => void;
  exitMode: () => void;
  firstUse: (id: FeatureId) => string | null;
  celebrate: () => void;         // Fireworks + a dance
  wiggle: () => void;            // A little happy wiggle
  saveLook: (look: Look) => void; // Into the album (if the photo settings allow)
}

const DRUMROLL_MS = 1600;  // At least this long, so the drumroll can finish
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The BMO Fashion Show (runway) and the quick outfit check
export const useFashionCompanion = (o: Options) => {
  const opts = useRef(o);
  opts.current = o;
  const [show, setShowState] = useState<FashionShow | null>(null);
  const [showOutfit, setShowOutfit] = useState<Outfit | null>(null);  // What BMO wears to match the last look
  const showRef = useRef(show);
  const setShow = useCallback((next: FashionShow | null) => { showRef.current = next; setShowState(next); }, []);

  const startShow = useCallback(() => {
    const { interrupt, enterMode, firstUse, quickLine } = opts.current;
    interrupt();
    enterMode();
    setShow({ style: 'runway', phase: 'ready', looks: [] });
    soundEffects.playRunway();
    const surprise = firstUse('fashion');
    quickLine(`${surprise ? `${surprise} ` : ''}Welcome to the BMO Fashion Show! Our star model is… YOU! Say "ready" when you're dressed, or tap the camera!`, 'starry', true);
  }, [setShow]);

  const startCheck = useCallback(() => {
    const { interrupt, enterMode, quickLine } = opts.current;
    interrupt();
    enterMode();
    setShow({ style: 'check', phase: 'camera', looks: [] });
    quickLine('Let BMO see! Strike a pose!', 'excited', true);
  }, [setShow]);

  const end = useCallback(() => {
    setShow(null);
    opts.current.exitMode();
  }, [setShow]);

  const takeLook = useCallback(() => {
    const current = showRef.current;
    if (!current || current.phase !== 'ready') return;
    opts.current.interrupt();
    setShow({ ...current, phase: 'camera' });
  }, [setShow]);

  const finale = useCallback(async () => {
    const current = showRef.current;
    if (!current) return;
    const { quickLine, celebrate } = opts.current;
    if (current.looks.length === 0) {
      end();
      quickLine('The BMO Fashion Show is over! See you next time, superstar!', 'happy', true);
      return;
    }
    let winner = 0;
    let line = '';
    if (current.looks.length >= 2) {
      opts.current.setMood('thinking');
      soundEffects.playDrumroll();
      const [result] = await Promise.all([fetchFinale(current.looks.map(l => l.award)), wait(DRUMROLL_MS)]);
      if (!showRef.current) return;  // Left meanwhile
      winner = result?.winner ?? Math.floor(Math.random() * current.looks.length);
      line = result?.line ?? '';
    }
    const award = current.looks[winner].award;
    setShow({ ...current, phase: 'finale', winner });
    celebrate();
    await quickLine(
      `${line || (current.looks.length > 1 ? `And the Look of the Night is… ${award}! Every look tonight was amazing!` : `What a show! Your ${award} look was the star of the night!`)} Thank you for coming to the BMO Fashion Show!`,
      'starry', true
    );
    if (showRef.current?.phase === 'finale') end();
  }, [setShow, end]);

  const onCapture = useCallback(async (photo: CapturedPhoto) => {
    const current = showRef.current;
    if (!current) return;
    const { setMood, quickLine, wiggle, saveLook } = opts.current;
    setShow({ ...current, phase: 'judging', judgingPhoto: photo.album });
    setMood('thinking');
    soundEffects.playDrumroll();
    const [judged] = await Promise.all([fetchFashion(await blobToDataUrl(photo.forAi), current.style), wait(DRUMROLL_MS)]);
    const latest = showRef.current;
    if (!latest) return;  // Left meanwhile
    const result = judged ?? FALLBACK_JUDGING;
    const look: Look = {
      award: result.award,
      comment: result.comment,
      tip: judged?.tip,
      accessory: isAccessory(result.accessory) ? result.accessory : 'bow',
      colour: result.colour,
      photo: photo.album
    };
    const looks = [...latest.looks, look];
    setShow({ ...latest, phase: 'result', looks, judgingPhoto: undefined });
    soundEffects.playTada();
    // BMO dresses up to match
    setShowOutfit({ accessory: look.accessory, colour: look.colour });
    wiggle();
    saveLook(look);

    if (latest.style === 'check') {
      await quickLine(`${look.comment}${look.tip ? ` Ooh, BMO has an idea: ${look.tip}` : ''} BMO is matching you!`, 'love', true);
      if (showRef.current?.style === 'check') end();
      return;
    }
    await quickLine(`And the award for ${look.award} goes to… YOU! ${look.comment}`, 'starry', true);
    const after = showRef.current;
    if (!after || after.phase !== 'result') return;
    if (showIsFull(after.looks.length)) {
      finale();
      return;
    }
    setShow({ ...after, phase: 'ready' });
    quickLine('Next look! Say "ready" when you\'ve changed, or say "that\'s all" for the finale!', 'excited', true);
  }, [setShow, end, finale]);

  const onCameraError = useCallback((message: string) => {
    const current = showRef.current;
    if (!current) return;
    // The show stays open so they can try again (an outfit check just ends)
    if (current.style === 'check') end();
    else setShow({ ...current, phase: 'ready' });
    opts.current.quickLine(message, 'confused', true);
  }, [setShow, end]);

  // Red button
  const leave = useCallback((announce = true) => {
    const current = showRef.current;
    end();
    if (announce && current?.style === 'runway') opts.current.quickLine('The BMO Fashion Show is over! Thanks, superstar!', 'happy', true);
  }, [end]);

  // What the friend says or types during a show
  const handleInput = useCallback((text: string) => {
    const current = showRef.current;
    if (!current || current.style !== 'runway') return;
    if (wantsFinale(text) && (current.phase === 'ready' || current.phase === 'result')) finale();
    else if (current.phase === 'ready' && wantsNextLook(text)) takeLook();
    else if (current.phase === 'ready') opts.current.quickLine('Say "ready" for your next look, or "that\'s all" for the finale!', 'happy', true);
  }, [finale, takeLook]);

  // BMO takes the show look off when it next wakes up
  const resetOutfit = useCallback(() => setShowOutfit(null), []);

  return { show, showOutfit, startShow, startCheck, takeLook, onCapture, onCameraError, finale, leave, handleInput, resetOutfit };
};
