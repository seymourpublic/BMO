import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BMOBody, BodyMotion, OtherButton } from './components/BMOBody';
import { BMOFace, LookDirection } from './components/BMOFace';
import { TypeBar } from './components/TypeBar';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { HAND_FOR_DIRECTION, RockPaperScissorsScreen, useRockPaperScissors } from './components/RockPaperScissors';
import { HiddenGame } from './components/HiddenGame';
import { EffectOverlays, FlashKind } from './components/EffectOverlays';
import { useFishAudio } from './hooks/useFishAudio';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useBMOConversation } from './hooks/useBMOConversation';
import { RpsResult, useMemory } from './hooks/useMemory';
import { IdleAction, useIdle } from './hooks/useIdle';
import { usePokes } from './hooks/usePokes';
import { Mood } from './types';
import { soundEffects } from './utils/sounds';
import { bmoSongs } from './utils/songs';
import { unlockIOSAudio } from './utils/iosAudio';
import { COLOR_THEMES, ThemeName, loadTheme, saveTheme } from './utils/themes';
import { PhraseEgg, createKonamiTracker } from './utils/easterEggs';
import { INTERRUPT_MIN_WORDS, canNudge, isEcho, isGoodbye, wordCount } from './utils/conversation';
import { isIOS } from './utils/iosAudio';
import { ChatContext, Occasion, fetchTodaysOccasion, setWakingListener, wakeBackend } from './utils/api';
import { poseFor } from './utils/pose';
import './App.css';

type Panel = 'none' | 'type' | 'history' | 'settings';
// Special modes (only one at a time). Detective and Football change how BMO talks.
type Mode = 'none' | 'detective' | 'football' | 'hiddenGame';

const GREETING_HINT = 'Hi friend! Press the red button to talk to BMO.';
// Captions longer than this shrink the face to make room
const LONG_CAPTION = 90;
// Four D-pad presses within this window make BMO dance
const DANCE_PRESSES = 4;
const DANCE_WINDOW_MS = 2000;

const FOOTBALL_WHISPERS = [
  'psst, Football… is friend still there?',
  'Football, do you think friend likes BMO?',
  'Football, stop copying BMO! …hehe.',
  'Football says hi, friend!'
];
// Sung with BMO's real voice; short and fixed so the audio is cached after the first time
const HUMS = ['Hmm hmm hmmm, doo doo dee', 'La la laaa, BMO is singing', 'Doo doo doo, Football and me'];
const noMelody = async () => {};

const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

// Bedtime BMO: late-night hours (friend's local time)
const isBedtime = (hour: number) => hour >= 22 || hour < 5;
// Stranger alarm: sometimes, after being away this long
const STRANGER_MIN_HOURS = 6;
const STRANGER_CHANCE = 0.25;
// Chance BMO sings for the special friend after saying hello
const GREETING_SONG_CHANCE = 0.2;
// How long to hold BMO's screen to meet Football
const SCREEN_HOLD_MS = 700;
const BATTERY_DOWN_MS = 3000;
const FIREWORKS_MS = 3500;
const todayString = () => new Date().toISOString().slice(0, 10);

// Conversation mode is remembered on this device
const CONVO_KEY = 'bmo-conversation';
const loadConversationMode = () => {
  try {
    return localStorage.getItem(CONVO_KEY) === 'on';
  } catch {
    return false;
  }
};
// iPhone Safari can't listen while BMO's voice plays, so talking over BMO is tap-to-interrupt there
const CAN_LISTEN_WHILE_SPEAKING = !isIOS();

const App: React.FC = () => {
  const [themeName, setThemeName] = useState<ThemeName>(loadTheme);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [awake, setAwake] = useState(false);
  const [dozing, setDozing] = useState(false);
  const [waking, setWaking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [typeSeed, setTypeSeed] = useState('');  // First key typed before the box opened
  const [look, setLook] = useState<LookDirection | null>(null);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [motion, setMotion] = useState<BodyMotion>(null);
  const [mode, setModeState] = useState<Mode>('none');
  const [hiddenButton, setHiddenButton] = useState(false);
  const [gamePlayId, setGamePlayId] = useState(0);
  const [gameJumps, setGameJumps] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [flash, setFlash] = useState<{ kind: FlashKind; id: number } | null>(null);
  const [fireworks, setFireworks] = useState(false);
  const [batteryLow, setBatteryLow] = useState(false);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [conversationMode, setConversationMode] = useState(loadConversationMode);
  const [convoActive, setConvoActiveState] = useState(false);  // In a back-and-forth right now
  const [waving, setWaving] = useState(false);
  const [occasion, setOccasion] = useState<Occasion | null>(null);  // Today's special day, if any

  const theme = COLOR_THEMES[themeName];
  const captionRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);
  const dpadPressesRef = useRef<number[]>([]);
  const lookTimerRef = useRef(0);
  const motionTimerRef = useRef(0);
  const modeRef = useRef<Mode>('none');
  const occasionRef = useRef<Occasion | null>(null);
  const konamiRef = useRef(createKonamiTracker());
  const screenHoldRef = useRef({ timer: 0, fired: false });
  const convoActiveRef = useRef(false);
  const handledEmptyRef = useRef(0);       // Last "heard nothing" turn already dealt with
  const lastNudgeRef = useRef(0);          // When BMO last spoke first
  const unansweredNudgesRef = useRef(0);   // Nudges since the friend last said anything

  const setConvoActive = useCallback((active: boolean) => {
    convoActiveRef.current = active;
    setConvoActiveState(active);
  }, []);

  // Mode lives in a ref too so a chat sent in the same moment sees the new mode
  const setMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setModeState(next);
    if (next !== 'none') setConvoActive(false);  // Games and modes end a conversation
  }, [setConvoActive]);

  const {
    speak, startQueue, enqueue, endQueue, isSpeaking, stop: stopSpeaking, prewarmAudio, getMouthLevel, getProgress
  } = useFishAudio();
  const {
    transcript, isListening, startListening, cancelListening, resetTranscript,
    isSupported: canListen, error: listenError, endedEmpty
  } = useSpeechRecognition();
  const {
    memory, payload: memoryPayload, addMessages, recordVisit,
    setProfileField, deleteNote, recordRps, forgetEverything,
    markSpecial, recordGameScore, unlockKonami, markBathJoke, markOccasionSeen
  } = useMemory();

  // Easter-egg phrases the app handles (set in effect below, after the conversation hook exists)
  const onEasterEggRef = useRef<(egg: PhraseEgg) => boolean>(() => false);
  const getContext = useCallback((): ChatContext => {
    const current = modeRef.current;
    return {
      mode: current === 'detective' || current === 'football' ? current : undefined,
      hour: new Date().getHours(),
      occasion: occasionRef.current?.kind
    };
  }, []);
  const {
    mood, setMood, caption, setCaption, isThinking, isSinging, displayMessages,
    send, tellStory, greet, sing, singForFriend, nudge, quickLine, interrupt, reset: resetConversation
  } = useBMOConversation({
    speak, startQueue, enqueue, endQueue, stopSpeaking,
    voiceEnabled, memory: memoryPayload, initialHistory: memory.history, onMessages: addMessages,
    isSpecial: memory.special,
    getContext,
    onEasterEgg: egg => onEasterEggRef.current(egg),
    onRecognised: markSpecial
  });

  const game = useRockPaperScissors({
    onResult: useCallback((result: RpsResult, line: string, resultMood: Mood) => {
      recordRps(result);
      quickLine(line, resultMood, true);
    }, [recordRps, quickLine])
  });

  const busy = isListening || isThinking || isSpeaking || isSinging || waking || game.active || panel !== 'none' || mode !== 'none';

  // Briefly point BMO's face somewhere
  const glance = useCallback((direction: LookDirection | null, ms: number) => {
    clearTimeout(lookTimerRef.current);
    setLook(direction);
    lookTimerRef.current = window.setTimeout(() => setLook(null), ms);
  }, []);

  const moveBody = useCallback((next: BodyMotion, ms: number) => {
    clearTimeout(motionTimerRef.current);
    setMotion(null);
    // Next frame, so the same animation can restart
    requestAnimationFrame(() => setMotion(next));
    motionTimerRef.current = window.setTimeout(() => setMotion(null), ms);
  }, []);

  // Wave hello for a couple of seconds
  const waveHello = useCallback(() => {
    setWaving(true);
    window.setTimeout(() => setWaving(false), 2500);
  }, []);

  // --- Easter eggs ---
  const flashScreen = useCallback((kind: FlashKind) => setFlash({ kind, id: Date.now() }), []);

  const danceTo = useCallback((line: string) => {
    soundEffects.playDance();
    moveBody('dance', 1500);
    quickLine(line, 'excited', true);
  }, [moveBody, quickLine]);

  const leaveMode = useCallback(() => {
    const was = modeRef.current;
    setMode('none');
    setHiddenButton(false);
    if (was === 'football') quickLine('Phew! BMO is back! Football is so sassy.', 'happy', true);
    if (was === 'detective') quickLine('Case closed. BMO hangs up the detective hat.', 'happy', true);
    if (was === 'hiddenGame') quickLine('BMO is so glad you made it out of the game safely!', 'happy', true);
  }, [setMode, quickLine]);

  const meetFootball = useCallback((announce: boolean) => {
    interrupt();
    setMode('football');
    if (announce) quickLine('Football here! Finally, somebody let me out of the mirror!', 'excited', true);
  }, [interrupt, setMode, quickLine]);

  // Phrases the app handles. Return true if the chat shouldn't also happen.
  onEasterEggRef.current = (egg: PhraseEgg) => {
    switch (egg) {
      case 'clickIt':
        danceTo('CLICK IT CLICK IT! Click it, click it, click it!');
        return true;
      case 'clockIt':
        danceTo("No no no, it's CLICK IT CLICK IT!");
        return true;
      case 'chop':
        interrupt();
        flashScreen('chop');
        moveBody('wiggle', 350);
        soundEffects.playEmote('excited');
        quickLine("BMO CHOP! If this were a real attack, you'd be dead.", 'excited', true);
        return true;
      case 'detective':
        setMode('detective');
        return false;  // BMO answers in noir style
      case 'caseClosed':
        if (modeRef.current === 'detective') setMode('none');
        return false;
      case 'football':
        meetFootball(false);
        return false;  // Football answers
      case 'footballBye':
        if (modeRef.current === 'football') setMode('none');
        return false;
      default:
        return false;
    }
  };

  const celebrateKonami = useCallback(() => {
    interrupt();
    setFireworks(true);
    window.setTimeout(() => setFireworks(false), FIREWORKS_MS);
    unlockKonami();
    soundEffects.playDance();
    moveBody('dance', 1500);
    quickLine('Cheat code activated! BMO is invincible! Check the rainbow in Settings!', 'excited', true);
  }, [interrupt, unlockKonami, moveBody, quickLine]);

  // Hidden button under the D-pad
  const revealHiddenButton = useCallback(() => {
    if (!awake || dozing || mode !== 'none') return;
    interrupt();
    setHiddenButton(true);
    soundEffects.playEmote('gasp');
    quickLine("No! Don't press that! You'll be transported into BMO's main brain game frame! It's far too dangerous!", 'surprised', true);
  }, [awake, dozing, mode, interrupt, quickLine]);

  const enterHiddenGame = useCallback(() => {
    interrupt();
    setHiddenButton(false);
    setGameOver(false);
    setMode('hiddenGame');
    setGamePlayId(id => id + 1);
    soundEffects.playDance();
  }, [interrupt, setMode]);

  const onHiddenGameOver = useCallback((score: number) => {
    setGameOver(true);
    const newBest = score > memory.stats.gameBest;
    recordGameScore(score);
    soundEffects.playEmote(newBest ? 'excited' : 'sad');
    quickLine(newBest ? `NEW HIGH SCORE! ${score}! BMO is so proud!` : 'Oh no! The monsters got you!', newBest ? 'excited' : 'sad', true);
  }, [memory.stats.gameBest, recordGameScore, quickLine]);

  // --- Idle life ---
  // Set further down; idle actions use it to let BMO speak first
  const tryNudgeRef = useRef<() => boolean>(() => false);

  const onIdleAction = useCallback((action: IdleAction) => {
    if (tryNudgeRef.current()) return;  // Sometimes BMO starts a conversation instead
    if (isBedtime(new Date().getHours()) && action !== 'hum') setMood('sleepy');  // Late at night BMO gets drowsy
    switch (action) {
      case 'look':
        glance('left', 700);
        window.setTimeout(() => glance('right', 700), 800);
        break;
      case 'hum': {
        const hum = pickRandom(HUMS);
        setCaption(`♪ ${hum} ♪`);
        sing(hum, noMelody);
        break;
      }
      case 'blink':
        setEyesClosed(true);
        window.setTimeout(() => setEyesClosed(false), 600);
        break;
      case 'football':
        glance('right', 1500);
        setCaption(pickRandom(FOOTBALL_WHISPERS));
        break;
    }
  }, [glance, setCaption, sing, setMood]);

  const onDoze = useCallback(() => {
    setDozing(true);
    setCaption('');
  }, [setCaption]);

  const idle = useIdle({ enabled: awake && !dozing && !busy, onAction: onIdleAction, onDoze });

  // BMO speaks first: only after a long quiet, not too often, and never nagging
  tryNudgeRef.current = () => {
    const now = Date.now();
    if (!canNudge({
      quietForMs: idle.quietForMs(),
      sinceLastNudgeMs: now - lastNudgeRef.current,
      unanswered: unansweredNudgesRef.current
    })) return false;
    lastNudgeRef.current = now;
    unansweredNudgesRef.current++;
    nudge().then(spoke => {
      // In conversation mode, listen for an answer
      if (spoke && conversationMode && canListen) {
        handledEmptyRef.current = endedEmpty;
        setConvoActive(true);
      }
    });
    return true;
  };
  const { poke } = usePokes();

  const wakeFromDoze = useCallback(() => {
    setDozing(false);
    waveHello();
    idle.bump();
    soundEffects.playEmote('gasp');
    quickLine('Oh! BMO was just resting its eyes!', 'surprised', true);
  }, [idle, quickLine, waveHello]);

  // --- Waking up and greeting ---
  // Unlock audio (must run inside a tap), sing hello, then say a personal hello
  const unlockAndGreet = useCallback(async () => {
    prewarmAudio();
    await unlockIOSAudio();
    await soundEffects.initialize();
    await bmoSongs.initialize();
    soundEffects.playButtonClick();
    waveHello();
    const voiceWorked = await sing('Hello friend!', () => bmoSongs.playHelloFriendMelody());
    setAudioBlocked(!voiceWorked);
    if (!voiceWorked) {
      setCaption('Tap BMO to turn on sound');
      return;
    }
    if (greetedRef.current) return;
    greetedRef.current = true;
    const visit = recordVisit();
    const now = new Date();

    // Stranger alarm: sometimes BMO doesn't recognise you after a long time away
    if (visit.visits > 1 && visit.hoursAway >= STRANGER_MIN_HOURS && Math.random() < STRANGER_CHANCE) {
      flashScreen('alarm');
      await quickLine('STRANGER! STRANGER!', 'surprised', true);
      await quickLine("...oh. Excuse me. It's you!", 'happy', true);
    }

    // After midnight, once a night: Finn's bath-time alarm
    if (now.getHours() < 5 && memory.lastBathJoke !== todayString()) {
      markBathJoke(todayString());
      await quickLine("Beep beep! It's Finn's bath time! ...Oh. Wrong alarm.", 'excited', true);
    }

    // Is today a special day for the special friend? (Checked before the greeting so BMO can mention it)
    const today = memory.special ? await fetchTodaysOccasion(now).catch(() => null) : null;
    occasionRef.current = today;
    setOccasion(today);

    const greeted = await greet({ ...visit, hour: now.getHours() });
    if (!greeted) setCaption(GREETING_HINT);

    // The special-day message plays once a year; on a birthday BMO also sings
    if (today && memory.occasionsSeen[today.id] !== now.getFullYear()) {
      markOccasionSeen(today.id, now.getFullYear());
      soundEffects.playEmote('excited');
      await quickLine(today.message, today.kind === 'birthday' ? 'starry' : 'love', true);
      if (today.kind === 'birthday') await singForFriend();
    } else if (greeted && memory.special && Math.random() < GREETING_SONG_CHANCE) {
      await singForFriend();
    }
  }, [prewarmAudio, sing, setCaption, recordVisit, greet, flashScreen, quickLine, memory.lastBathJoke, memory.special,
      memory.occasionsSeen, markBathJoke, markOccasionSeen, singForFriend, waveHello]);

  const wake = useCallback(async () => {
    if (awake || waking) return;
    setWaking(true);
    try {
      // Ask for the mic now so the first talk isn't interrupted by a permission prompt
      if (canListen && navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => stream.getTracks().forEach(track => track.stop()))
          .catch(() => { /* Denied - BMO will say so when you try to talk */ });
      }
      setAwake(true);
      await unlockAndGreet();
    } finally {
      setWaking(false);
    }
  }, [awake, waking, canListen, unlockAndGreet]);

  // Any button/tap/key first wakes BMO; returns true if it was asleep
  const wakeIfNeeded = useCallback((): boolean => {
    if (!awake) {
      wake();
      return true;
    }
    if (dozing) {
      wakeFromDoze();
      return true;
    }
    idle.bump();
    return false;
  }, [awake, dozing, wake, wakeFromDoze, idle]);

  // --- Buttons ---
  const pressRed = useCallback(() => {
    if (wakeIfNeeded()) return;
    if (konamiRef.current.expects('red')) {
      if (konamiRef.current.press('red')) celebrateKonami();
      return;
    }
    konamiRef.current.press('red');
    if (modeRef.current === 'hiddenGame') {
      if (gameOver) leaveMode();
      else setGameJumps(j => j + 1);
      return;
    }
    if (modeRef.current !== 'none') {
      leaveMode();
      return;
    }
    if (game.active) {
      game.quit();
      soundEffects.playButtonClick();
      quickLine('Good game, friend!', 'happy', false);
      return;
    }
    if (isListening || convoActiveRef.current) {
      // Red while listening, or during a conversation, stops
      cancelListening();
      setConvoActive(false);
      soundEffects.playVoiceStop();
      setCaption('');
      return;
    }
    if (!canListen) {
      setCaption("This browser can't hear BMO. Type instead!");
      setPanel('type');
      return;
    }
    interrupt();  // Stop any reply still being written or spoken
    soundEffects.playVoiceStart();
    setCaption('');
    if (conversationMode) {
      handledEmptyRef.current = endedEmpty;
      setConvoActive(true);
    }
    startListening();
  }, [wakeIfNeeded, celebrateKonami, gameOver, leaveMode, game, quickLine, isListening, cancelListening, canListen, interrupt,
      startListening, setCaption, conversationMode, endedEmpty, setConvoActive]);

  const pressDirection = useCallback((direction: LookDirection) => {
    if (game.active) {
      const hand = HAND_FOR_DIRECTION[direction];
      if (hand) game.pick(hand);
      return;
    }
    soundEffects.playDirection(direction);
    glance(direction, 600);

    const now = Date.now();
    dpadPressesRef.current = [...dpadPressesRef.current.filter(t => now - t < DANCE_WINDOW_MS), now];
    if (dpadPressesRef.current.length >= DANCE_PRESSES) {
      dpadPressesRef.current = [];
      soundEffects.playDance();
      setMood('excited');
      setCaption('BMO has the moves!');
      moveBody('dance', 1500);
    } else {
      moveBody('wiggle', 350);
    }
  }, [game, glance, moveBody, setMood, setCaption]);

  const pressOther = useCallback((button: OtherButton) => {
    if (wakeIfNeeded()) return;
    if (konamiRef.current.expects(button)) {
      konamiRef.current.press(button);  // Part of the code, not a normal press
      return;
    }
    konamiRef.current.press(button);
    if (isThinking) return;

    if (modeRef.current === 'hiddenGame') {
      if (button === 'triangle' && gameOver) {
        setGameOver(false);
        setGamePlayId(id => id + 1);  // Play again
      }
      return;
    }

    if (button === 'green') {
      if (modeRef.current !== 'none') setMode('none');
      if (game.active) game.quit();
      soundEffects.playButtonClick();
      tellStory();  // Replaces any reply in progress
    } else if (button === 'triangle') {
      if (game.active && game.phase !== 'reveal') return;
      if (modeRef.current !== 'none') setMode('none');
      interrupt();
      game.start();
      setMood('excited');
    } else {
      pressDirection(button);
    }
  }, [wakeIfNeeded, isThinking, gameOver, setMode, game, interrupt, tellStory, pressDirection, setMood]);

  // Tapping BMO's screen or body
  const tapBMO = useCallback(() => {
    if (!awake) { wake(); return; }
    if (dozing) { wakeFromDoze(); return; }
    if (audioBlocked) { unlockAndGreet(); return; }
    idle.bump();
    // In a conversation, tapping BMO while it talks interrupts it so the friend can speak
    if (convoActiveRef.current && isSpeaking) {
      interrupt();
      return;
    }
    // Pokes still count while BMO says a poke line, so the battery joke is reachable
    if (isListening || isThinking || isSinging || waking || game.active || mode !== 'none' || panel !== 'none' || batteryLow) return;
    const reaction = poke();
    soundEffects.playEmote(reaction.sound);
    if (reaction.batteryLow) {
      interrupt();
      setBatteryLow(true);
      quickLine(reaction.line, reaction.mood, true);
      window.setTimeout(() => {
        setBatteryLow(false);
        soundEffects.playDance();
        quickLine('BMO always bounces back!', 'excited', true);
      }, BATTERY_DOWN_MS);
      return;
    }
    if (isSpeaking) return;  // Just the sound while BMO is still talking
    quickLine(reaction.line, reaction.mood, reaction.spoken);
  }, [awake, dozing, audioBlocked, isListening, isThinking, isSinging, isSpeaking, waking, game.active, mode, panel, batteryLow,
      wake, wakeFromDoze, unlockAndGreet, idle, poke, interrupt, quickLine]);

  // Holding BMO's screen lets Football out of the mirror
  const startScreenHold = useCallback(() => {
    clearTimeout(screenHoldRef.current.timer);
    screenHoldRef.current.fired = false;
    if (!awake || dozing || mode !== 'none') return;
    screenHoldRef.current.timer = window.setTimeout(() => {
      screenHoldRef.current.fired = true;
      meetFootball(true);
    }, SCREEN_HOLD_MS);
  }, [awake, dozing, mode, meetFootball]);
  const cancelScreenHold = useCallback(() => clearTimeout(screenHoldRef.current.timer), []);

  const sendTyped = useCallback((text: string) => {
    idle.bump();
    unansweredNudgesRef.current = 0;
    soundEffects.playSend();
    if (game.active) game.quit();
    send(text);  // Replaces any reply in progress
  }, [idle, send, game]);

  // Start waking the backend as soon as the page opens (it sleeps when unused), and
  // tell the friend what's happening if a request has to wait for it
  useEffect(() => {
    wakeBackend();
    setWakingListener(() => {
      setMood('thinking');
      setCaption('BMO is waking up its brain… this can take a minute on the first try!');
    });
    return () => setWakingListener(null);
  }, [setMood, setCaption]);

  // Keep the hour current for bedtime BMO
  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // When listening ends with something heard, send it
  useEffect(() => {
    if (isListening || !transcript.trim()) return;
    const heard = transcript.trim();
    resetTranscript();
    // In a conversation the microphone may have just heard BMO's own voice: ignore that
    if (convoActiveRef.current && isEcho(heard, caption)) return;
    idle.bump();
    unansweredNudgesRef.current = 0;
    if (convoActiveRef.current && isGoodbye(heard)) setConvoActive(false);  // BMO says bye, then stops listening
    soundEffects.playVoiceStop();
    send(heard);
  }, [isListening, transcript, resetTranscript, send, caption, idle, setConvoActive]);

  // Talking over BMO: real words (not BMO's own echo) while it speaks stop it mid-sentence
  useEffect(() => {
    if (!isListening || !isSpeaking || !convoActiveRef.current) return;
    if (wordCount(transcript) >= INTERRUPT_MIN_WORDS && !isEcho(transcript, caption)) {
      interrupt();
      setMood('surprised');
    }
  }, [isListening, isSpeaking, transcript, caption, interrupt, setMood]);

  // Conversation mode: keep the microphone going between turns
  useEffect(() => {
    if (!convoActive || isListening) return;
    if (endedEmpty !== handledEmptyRef.current) {
      handledEmptyRef.current = endedEmpty;
      // Heard nothing after BMO finished talking: the friend has gone quiet
      if (!isSpeaking && !isThinking) {
        setConvoActive(false);
        quickLine('BMO will be right here!', 'happy', true);
        return;
      }
    }
    if (transcript.trim()) return;  // About to be sent
    if (isThinking || isSinging || waking || game.active || mode !== 'none' || panel !== 'none' || batteryLow || dozing) return;
    if (isSpeaking && !CAN_LISTEN_WHILE_SPEAKING) return;  // iPhone: listen again once BMO finishes
    startListening();
  }, [convoActive, isListening, endedEmpty, isSpeaking, isThinking, isSinging, waking, game.active, mode, panel, batteryLow,
      dozing, transcript, startListening, setConvoActive, quickLine]);

  const toggleConversationMode = () => {
    const next = !conversationMode;
    setConversationMode(next);
    try {
      localStorage.setItem(CONVO_KEY, next ? 'on' : 'off');
    } catch {
      // Not critical
    }
    if (!next) {
      setConvoActive(false);
      cancelListening();
    }
    soundEffects.playButtonClick();
    setCaption(next
      ? 'Conversation mode on! Press the red button and we can just talk.'
      : 'Conversation mode off. Press red each time you want to talk.');
  };

  // A new caption starts at the top (but a caption that's still typing out keeps its place)
  const lastCaptionRef = useRef('');
  useEffect(() => {
    if (!caption.startsWith(lastCaptionRef.current) || !lastCaptionRef.current) {
      captionRef.current?.scrollTo({ top: 0 });
    }
    lastCaptionRef.current = caption;
  }, [caption]);

  // While BMO talks, scroll a long caption along with the voice
  useEffect(() => {
    if (!isSpeaking) return;
    let rafId = 0;
    const follow = () => {
      const el = captionRef.current;
      if (el && el.scrollHeight > el.clientHeight) {
        // Keep the spoken point about a third of the way down the box
        const target = getProgress() * el.scrollHeight - el.clientHeight / 3;
        el.scrollTop = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight));
      }
      rafId = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(rafId);
  }, [isSpeaking, getProgress]);

  // Microphone problems
  useEffect(() => {
    if (!listenError) return;
    setMood('confused');
    setCaption(/denied|not-allowed/i.test(listenError)
      ? "BMO can't hear you. Check the microphone permission!"
      : "BMO couldn't hear that. Try again?");
  }, [listenError, setMood, setCaption]);

  // Keyboard: Space = red button, arrows = D-pad, typing opens the text box
  useEffect(() => {
    const arrows: Record<string, LookDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const onKey = (e: KeyboardEvent) => {
      if (panel !== 'none' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, button, [contenteditable]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!isThinking) pressRed();
      } else if (arrows[e.key]) {
        e.preventDefault();
        pressOther(arrows[e.key]);
      } else if (awake && e.key.length === 1) {
        e.preventDefault();
        if (dozing) wakeFromDoze();
        setTypeSeed(e.key);
        setPanel('type');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, awake, dozing, isThinking, pressRed, pressOther, wakeFromDoze]);

  const changeTheme = (name: ThemeName) => {
    setThemeName(name);
    saveTheme(name);
    soundEffects.playButtonClick();
  };

  const changeVoice = (enabled: boolean) => {
    if (!enabled) stopSpeaking();
    setVoiceEnabled(enabled);
  };

  const forget = () => {
    forgetEverything();
    resetConversation();
  };

  const openPanel = (next: Panel) => {
    soundEffects.playButtonClick();
    if (dozing) setDozing(false);
    setTypeSeed('');
    setPanel(next);
  };
  const closePanel = useCallback(() => setPanel('none'), []);

  // What BMO's screen caption shows right now
  // (In a conversation the microphone also stays on while BMO talks; then BMO's words show)
  const listeningOnly = isListening && !isSpeaking && !isThinking;
  const screenCaption = dozing ? ''
    : listeningOnly ? (transcript ? `“${transcript}…”` : 'BMO is listening…')
    : caption;
  const asleep = !awake || dozing;
  const screenEffects = [
    asleep ? 'bmo-asleep' : '',
    mode === 'detective' ? 'bmo-noir' : '',
    batteryLow ? 'bmo-battery-low' : '',
    awake && !asleep && isBedtime(hour) ? 'bmo-bedtime' : ''
  ].join(' ');

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-4 py-8 overflow-hidden bg-gradient-to-b from-[#bfe9dd] to-[#7fcfbf] text-[#173a33]">
      {/* Music notes while BMO sings */}
      {isSinging && (
        <div className="fixed inset-0 pointer-events-none z-30" aria-hidden="true">
          {['♪', '♫', '♬', '♪', '♫'].map((note, i) => (
            <span
              key={i}
              className="absolute text-4xl animate-float-up"
              style={{ left: `${15 + i * 17}%`, top: `${30 + (i % 3) * 15}%`, animationDelay: `${i * 0.3}s`, color: theme.outline }}
            >
              {note}
            </span>
          ))}
        </div>
      )}

      <EffectOverlays flash={flash} fireworks={fireworks} occasion={awake ? occasion?.kind : null} />

      <BMOBody
        theme={theme}
        listening={isListening || convoActive}
        redDisabled={isThinking || waking}
        onRed={pressRed}
        onOtherButton={pressOther}
        onBodyTap={tapBMO}
        onDpadCenterHold={revealHiddenButton}
        hiddenButton={hiddenButton}
        onHiddenButton={enterHiddenGame}
        motion={motion}
        pose={poseFor({ dancing: motion === 'dance', waving, asleep, speaking: isSpeaking, mood })}
      >
        <button
          type="button"
          className={`absolute inset-0 w-full h-full flex flex-col cursor-default touch-none ${screenEffects}`}
          onClick={() => {
            // A long press (Football) shouldn't also count as a poke
            if (screenHoldRef.current.fired) {
              screenHoldRef.current.fired = false;
              return;
            }
            tapBMO();
          }}
          onPointerDown={startScreenHold}
          onPointerUp={cancelScreenHold}
          onPointerLeave={cancelScreenHold}
          onContextMenu={e => e.preventDefault()}
          aria-label={!awake ? 'Wake BMO' : dozing ? 'BMO is dozing. Tap to wake' : 'Poke BMO'}
        >
          {mode === 'detective' && <div className="absolute inset-0 pointer-events-none bmo-rain" aria-hidden="true" />}
          {mode === 'football' && (
            <div className="absolute inset-0 pointer-events-none bmo-mirror-world" aria-hidden="true">
              <span className="absolute top-[4%] left-1/2 -translate-x-1/2 text-[clamp(9px,2.6vw,11px)] font-extrabold tracking-[0.3em]" style={{ color: theme.face }}>
                FOOTBALL
              </span>
            </div>
          )}
          {mode === 'hiddenGame' ? (
            <HiddenGame
              color={theme.face}
              best={memory.stats.gameBest}
              jumps={gameJumps}
              playId={gamePlayId}
              onGameOver={onHiddenGameOver}
            />
          ) : game.active ? (
            <RockPaperScissorsScreen
              game={game}
              score={memory.stats.rps}
              color={theme.face}
              friendName={memory.profile.name}
              reaction={game.phase === 'reveal' ? caption : ''}
            />
          ) : (
            <>
              <div className={`w-[78%] mx-auto transition-all duration-300 ${mode === 'football' ? 'bmo-mirror' : ''} ${
                asleep || !screenCaption ? 'h-[70%] mt-[15%]'
                  : screenCaption.length > LONG_CAPTION ? 'h-[34%] mt-[3%]'
                  : 'h-[52%] mt-[6%]'
              }`}>
                <BMOFace
                  mood={mood}
                  look={mode === 'football' ? 'left' : look}
                  eyesClosed={eyesClosed}
                  faceColor={theme.face}
                  asleep={asleep}
                  listening={listeningOnly}
                  speaking={isSpeaking}
                  singing={isSinging}
                  getMouthLevel={getMouthLevel}
                />
              </div>
              {!asleep && screenCaption && (
                <div
                  ref={captionRef}
                  className="bmo-caption mx-[5%] mb-[4%] mt-auto max-h-[58%] overflow-y-auto rounded-lg px-3 py-2 text-[clamp(13px,3.6vw,15px)] leading-snug text-center bg-white/70"
                  style={{ color: theme.face }}
                  aria-live="polite"
                >
                  {screenCaption}
                </div>
              )}
            </>
          )}
        </button>
      </BMOBody>

      {awake ? (
        <nav className="flex gap-4" aria-label="BMO menu">
          <button
            type="button"
            onClick={toggleConversationMode}
            aria-pressed={conversationMode}
            className="flex flex-col items-center gap-1 text-xs font-semibold"
          >
            <span className={`w-12 h-12 rounded-full border-2 shadow flex items-center justify-center text-xl ${conversationMode ? 'bg-[#43b649] border-[#2a7d30]' : 'bg-white/80 border-white hover:bg-white'}`}>
              💬
            </span>
            {conversationMode ? 'Talk: on' : 'Talk mode'}
          </button>
          {([
            ['type', '⌨️', 'Type'],
            ['history', '🕘', 'Messages'],
            ['settings', '⚙️', 'Settings'],
          ] as const).map(([name, icon, label]) => (
            <button
              key={name}
              type="button"
              onClick={() => openPanel(name)}
              className="flex flex-col items-center gap-1 text-xs font-semibold"
            >
              <span className="w-12 h-12 rounded-full bg-white/80 border-2 border-white shadow flex items-center justify-center text-xl hover:bg-white">
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>
      ) : (
        <p className="text-sm font-semibold text-center animate-pulse">
          Press the <span className="text-[#c62828]">red button</span> to wake BMO
        </p>
      )}

      {panel === 'type' && (
        <TypeBar initialText={typeSeed} disabled={isThinking} onSend={sendTyped} onClose={closePanel} />
      )}
      {panel === 'history' && <HistoryPanel messages={displayMessages} onClose={closePanel} />}
      {panel === 'settings' && (
        <SettingsPanel
          themeName={themeName}
          onThemeChange={changeTheme}
          secretsUnlocked={memory.stats.konami}
          voiceEnabled={voiceEnabled}
          onVoiceChange={changeVoice}
          profile={memory.profile}
          notes={memory.notes}
          onProfileChange={setProfileField}
          onDeleteNote={deleteNote}
          onForget={forget}
          onClose={closePanel}
        />
      )}
    </div>
  );
};

export default App;
