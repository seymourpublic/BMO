import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BMOBody, BodyMotion, OtherButton } from './components/BMOBody';
import { BMOFace, LookDirection } from './components/BMOFace';
import { TypeBar } from './components/TypeBar';
import { HistoryPanel } from './components/HistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { HAND_FOR_DIRECTION, RockPaperScissorsScreen, useRockPaperScissors } from './components/RockPaperScissors';
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
import './App.css';

type Panel = 'none' | 'type' | 'history' | 'settings';

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

  const theme = COLOR_THEMES[themeName];
  const captionRef = useRef<HTMLDivElement>(null);
  const greetedRef = useRef(false);
  const dpadPressesRef = useRef<number[]>([]);
  const lookTimerRef = useRef(0);
  const motionTimerRef = useRef(0);

  const {
    speak, startQueue, enqueue, endQueue, isSpeaking, stop: stopSpeaking, prewarmAudio, getMouthLevel, getProgress
  } = useFishAudio();
  const {
    transcript, isListening, startListening, cancelListening, resetTranscript,
    isSupported: canListen, error: listenError
  } = useSpeechRecognition();
  const {
    memory, payload: memoryPayload, addMessages, recordVisit,
    setProfileField, deleteNote, recordRps, forgetEverything
  } = useMemory();
  const {
    mood, setMood, caption, setCaption, isThinking, isSinging, displayMessages,
    send, tellStory, greet, sing, quickLine, interrupt, reset: resetConversation
  } = useBMOConversation({
    speak, startQueue, enqueue, endQueue, stopSpeaking,
    voiceEnabled, memory: memoryPayload, initialHistory: memory.history, onMessages: addMessages
  });

  const game = useRockPaperScissors({
    onResult: useCallback((result: RpsResult, line: string, resultMood: Mood) => {
      recordRps(result);
      quickLine(line, resultMood, true);
    }, [recordRps, quickLine])
  });

  const busy = isListening || isThinking || isSpeaking || isSinging || waking || game.active || panel !== 'none';

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

  // --- Idle life ---
  const onIdleAction = useCallback((action: IdleAction) => {
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
  }, [glance, setCaption, sing]);

  const onDoze = useCallback(() => {
    setDozing(true);
    setCaption('');
  }, [setCaption]);

  const idle = useIdle({ enabled: awake && !dozing && !busy, onAction: onIdleAction, onDoze });
  const { poke } = usePokes();

  const wakeFromDoze = useCallback(() => {
    setDozing(false);
    idle.bump();
    soundEffects.playEmote('gasp');
    quickLine('Oh! BMO was just resting its eyes!', 'surprised', true);
  }, [idle, quickLine]);

  // --- Waking up and greeting ---
  // Unlock audio (must run inside a tap), sing hello, then say a personal hello
  const unlockAndGreet = useCallback(async () => {
    prewarmAudio();
    await unlockIOSAudio();
    await soundEffects.initialize();
    await bmoSongs.initialize();
    soundEffects.playButtonClick();
    const voiceWorked = await sing('Hello friend!', () => bmoSongs.playHelloFriendMelody());
    setAudioBlocked(!voiceWorked);
    if (!voiceWorked) {
      setCaption('Tap BMO to turn on sound');
      return;
    }
    if (greetedRef.current) return;
    greetedRef.current = true;
    const visit = recordVisit();
    const greeted = await greet({ ...visit, hour: new Date().getHours() });
    if (!greeted) setCaption(GREETING_HINT);
  }, [prewarmAudio, sing, setCaption, recordVisit, greet]);

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
    if (game.active) {
      game.quit();
      soundEffects.playButtonClick();
      quickLine('Good game, friend!', 'happy', false);
      return;
    }
    if (isListening) {
      cancelListening();
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
    startListening();
  }, [wakeIfNeeded, game, quickLine, isListening, cancelListening, canListen, interrupt, startListening, setCaption]);

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
    if (isThinking) return;

    if (button === 'green') {
      if (game.active) game.quit();
      soundEffects.playButtonClick();
      tellStory();  // Replaces any reply in progress
    } else if (button === 'triangle') {
      if (game.active && game.phase !== 'reveal') return;
      interrupt();
      game.start();
      setMood('excited');
    } else {
      pressDirection(button);
    }
  }, [wakeIfNeeded, isThinking, game, interrupt, tellStory, pressDirection, setMood]);

  // Tapping BMO's screen or body
  const tapBMO = useCallback(() => {
    if (!awake) { wake(); return; }
    if (dozing) { wakeFromDoze(); return; }
    if (audioBlocked) { unlockAndGreet(); return; }
    idle.bump();
    if (busy) return;
    const reaction = poke();
    soundEffects.playEmote(reaction.sound);
    quickLine(reaction.line, reaction.mood, reaction.spoken);
  }, [awake, dozing, audioBlocked, busy, wake, wakeFromDoze, unlockAndGreet, idle, poke, quickLine]);

  const sendTyped = useCallback((text: string) => {
    idle.bump();
    soundEffects.playSend();
    if (game.active) game.quit();
    send(text);  // Replaces any reply in progress
  }, [idle, send, game]);

  // When listening ends with something heard, send it
  useEffect(() => {
    if (!isListening && transcript.trim()) {
      const heard = transcript.trim();
      resetTranscript();
      soundEffects.playVoiceStop();
      send(heard);
    }
  }, [isListening, transcript, resetTranscript, send]);

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
  const screenCaption = dozing ? ''
    : isListening ? (transcript ? `“${transcript}…”` : 'BMO is listening…')
    : caption;
  const asleep = !awake || dozing;

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

      <BMOBody
        theme={theme}
        listening={isListening}
        redDisabled={isThinking || waking}
        onRed={pressRed}
        onOtherButton={pressOther}
        onBodyTap={tapBMO}
        motion={motion}
      >
        <button
          type="button"
          className={`absolute inset-0 w-full h-full flex flex-col cursor-default ${asleep ? 'bmo-asleep' : ''}`}
          onClick={tapBMO}
          aria-label={!awake ? 'Wake BMO' : dozing ? 'BMO is dozing. Tap to wake' : 'Poke BMO'}
        >
          {game.active ? (
            <RockPaperScissorsScreen
              game={game}
              score={memory.stats.rps}
              color={theme.face}
              friendName={memory.profile.name}
              reaction={game.phase === 'reveal' ? caption : ''}
            />
          ) : (
            <>
              <div className={`w-[78%] mx-auto transition-all duration-300 ${
                asleep || !screenCaption ? 'h-[70%] mt-[15%]'
                  : screenCaption.length > LONG_CAPTION ? 'h-[34%] mt-[3%]'
                  : 'h-[52%] mt-[6%]'
              }`}>
                <BMOFace
                  mood={mood}
                  look={look}
                  eyesClosed={eyesClosed}
                  faceColor={theme.face}
                  asleep={asleep}
                  listening={isListening}
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
        <nav className="flex gap-5" aria-label="BMO menu">
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
