import { useState, useRef, useCallback } from 'react';
import { Message, Mood } from '../types';
import { ChatContext, fetchSong, recogniseFriend, streamChat } from '../utils/api';
import { createSentenceSplitter, captionText } from '../utils/sentenceSplitter';
import { emoteToMood } from '../utils/emotes';
import { soundEffects } from '../utils/sounds';
import { bmoSongs, SongMelody } from '../utils/songs';
import { PhraseEgg, asksForName, detectPhrase, extractIntroName } from '../utils/easterEggs';
import { formatNow } from '../utils/conversation';
import { STORY_PROMPTS } from '../utils/constants';
import { HistoryMessage, MemoryPayload } from '../utils/memory';
import { PLAYBACK_BLOCKED } from './useFishAudio';

export type DisplayMessage = HistoryMessage;

interface Options {
  speak: (text: string) => Promise<void>;
  // Streamed speech queue from useFishAudio
  startQueue: () => void;
  enqueue: (text: string) => void;
  endQueue: () => Promise<void>;
  stopSpeaking: () => void;
  voiceEnabled: boolean;
  memory: MemoryPayload;
  initialHistory: HistoryMessage[];
  onMessages: (messages: HistoryMessage[]) => void;  // Persist new messages
  isSpecial: boolean;                                // Talking with the friend BMO was made for
  getContext: () => ChatContext;                     // Mode + hour from the app
  // A phrase easter egg was said. Return true if the app handled it fully (don't chat).
  onEasterEgg: (egg: PhraseEgg) => boolean;
  onRecognised: (name: string, pronouns: string) => void;
}

// The special friend's own songs (the original one has its own trigger phrases)
const FRIEND_SONGS = ['bright', 'morning'];

// Only the last few messages are sent to the API, for speed
const HISTORY_LIMIT = 6;
const STORY_LABEL = '📖 Story time!';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Thrown when a newer reply (or an interruption) replaced the one in progress
class ReplySuperseded extends Error {
  constructor() {
    super('Reply superseded');
    this.name = 'ReplySuperseded';
  }
}

const toApiMessage = (m: HistoryMessage): Message => ({
  role: m.role,
  content: m.kind === 'story' ? '(Friend asked BMO for a story)' : m.text
});

// The API needs the conversation to start with the friend speaking
const recentForApi = (history: Message[]): Message[] => {
  const recent = history.slice(-HISTORY_LIMIT);
  const firstUser = recent.findIndex(m => m.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
};

export const useBMOConversation = ({
  speak, startQueue, enqueue, endQueue, stopSpeaking, voiceEnabled, memory, initialHistory, onMessages,
  isSpecial, getContext, onEasterEgg, onRecognised
}: Options) => {
  const [mood, setMood] = useState<Mood>('happy');
  const [caption, setCaption] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSinging, setIsSinging] = useState(false);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(initialHistory);

  // Refs so callbacks stay stable and never read stale values
  const historyRef = useRef<Message[]>(initialHistory.map(toApiMessage));
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const onMessagesRef = useRef(onMessages);
  onMessagesRef.current = onMessages;
  const isSpecialRef = useRef(isSpecial);
  isSpecialRef.current = isSpecial;
  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  const onEasterEggRef = useRef(onEasterEgg);
  onEasterEggRef.current = onEasterEgg;
  const onRecognisedRef = useRef(onRecognised);
  onRecognisedRef.current = onRecognised;
  // Did BMO's last reply ask for the friend's name? (Then a one-word answer is their name.)
  const askedNameRef = useRef(false);

  const chatContext = (extra: ChatContext = {}): ChatContext => ({
    now: formatNow(),
    ...getContextRef.current(),
    special: isSpecialRef.current || undefined,
    ...extra
  });
  // Each reply gets an id; a newer reply or an interruption cancels the old one
  const replyIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel the reply in progress (download, caption updates and voice)
  const interrupt = useCallback(() => {
    replyIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    stopSpeaking();
  }, [stopSpeaking]);

  const say = useCallback(async (text: string) => {
    if (voiceEnabledRef.current) {
      await speak(text).catch(() => {});  // Voice errors don't stop the conversation
    }
  }, [speak]);

  // Stream BMO's reply: the caption types out live, emotes act out as they arrive,
  // and each finished sentence is voiced straight away. Resolves with the full reply
  // once it has been written; call finishSpeaking() to wait for the voice to finish.
  const streamReply = useCallback(async (request: {
    history?: Message[];
    nudge?: boolean;
    greeting?: { hoursAway: number; hour: number; visits: number };
    context?: ChatContext;
  }) => {
    // Cancel any reply still in progress; this one takes over the caption and the voice
    abortRef.current?.abort();
    const id = ++replyIdRef.current;
    const isCurrent = () => id === replyIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    const voice = voiceEnabledRef.current;
    if (voice) startQueue();
    let received = '';
    const splitter = createSentenceSplitter({
      onSentence: sentence => { if (voice && isCurrent()) enqueue(sentence); },
      onEmote: emote => {
        if (!isCurrent()) return;
        setMood(emoteToMood(emote));
        soundEffects.playEmote(emote);
      }
    });

    try {
      const reply = await streamChat({
        ...request,
        memory: memoryRef.current,
        signal: controller.signal,
        onText: delta => {
          if (!isCurrent()) return;
          if (!received) {
            // First words: stop "thinking" and start showing the reply
            setIsThinking(false);
            setMood('happy');
            soundEffects.playReceive();
          }
          received += delta;
          // Skip the moment where only an *emote* has arrived, so the caption doesn't flash empty
          const visible = captionText(received);
          if (visible) setCaption(visible);
          splitter.push(delta);
        }
      });
      if (!isCurrent()) throw new ReplySuperseded();
      // A reply cut short is trimmed to its last full sentence; don't voice the unfinished tail
      if (reply.trim() === received.trim()) splitter.end();
      setCaption(captionText(reply));
      askedNameRef.current = asksForName(reply);
      return reply;
    } catch (error) {
      if (!isCurrent()) throw new ReplySuperseded();  // The newer reply owns the voice now
      if (voice) stopSpeaking();
      throw error;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [startQueue, enqueue, stopSpeaking]);

  // Wait for BMO to finish saying the current reply (resolves early if interrupted)
  const finishSpeaking = useCallback(async () => {
    if (voiceEnabledRef.current) await endQueue().catch(() => {});  // Voice errors don't stop the chat
  }, [endQueue]);

  const showError = useCallback(async (error: unknown) => {
    console.error('Error talking to BMO:', error);
    const errorMsg = error instanceof Error && error.message
      ? error.message
      : "Oh no! BMO's circuits got confused! BMO needs a moment...";
    setIsThinking(false);
    setMood('sad');
    setCaption(errorMsg);
    setDisplayMessages(prev => [...prev, { role: 'assistant', text: errorMsg }]);
    soundEffects.playError();
    await say(errorMsg);
  }, [say]);

  // Play a melody, then sing the lyrics. Resolves false if the browser blocked playback
  // (other voice problems, like the backend being down, aren't fixed by a tap).
  const sing = useCallback(async (lyrics: string, melody: () => Promise<void>): Promise<boolean> => {
    setIsSinging(true);
    setMood('excited');
    let voiceWorked = true;
    try {
      await melody();
      if (voiceEnabledRef.current) {
        await speak(`♪ ${lyrics} ♪`).catch((err: unknown) => {
          if (err instanceof Error && err.message === PLAYBACK_BLOCKED) voiceWorked = false;
        });
      }
    } finally {
      setIsSinging(false);
      setMood('happy');
    }
    return voiceWorked;
  }, [speak]);

  // Send one friend message (or story request) and deliver BMO's reply
  const converse = useCallback(async (userEntry: HistoryMessage, apiContent: string, extra: ChatContext = {}) => {
    setIsThinking(true);
    setMood('thinking');
    setCaption(userEntry.kind === 'story' ? STORY_LABEL : `“${userEntry.text}”`);
    setDisplayMessages(prev => [...prev, userEntry]);

    const newHistory: Message[] = [...historyRef.current, { role: 'user', content: apiContent }];

    let reply: string;
    try {
      reply = await streamReply({ history: recentForApi(newHistory), context: chatContext(extra) });
    } catch (error) {
      // Interrupted: the friend moved on, so this turn isn't kept in the conversation
      if (error instanceof ReplySuperseded) return;
      await showError(error);
      return;
    }
    const replyEntry: HistoryMessage = { role: 'assistant', text: reply };
    // The failed-turn case never reaches here, so history stays consistent
    historyRef.current = [...newHistory, { role: 'assistant', content: reply }];
    setDisplayMessages(prev => [...prev, replyEntry]);
    onMessagesRef.current([userEntry, replyEntry]);
    await finishSpeaking();
  }, [streamReply, finishSpeaking, showError]);

  // Sing one of the special songs (lyrics come from the server, never from this code)
  const singSong = useCallback(async (id: string) => {
    interrupt();
    const song = await fetchSong(id, isSpecialRef.current).catch(() => null);
    if (!song) {
      setCaption('BMO forgot the words! *sniffles*');
      setMood('sad');
      return;
    }
    soundEffects.playEmote('excited');
    setCaption(`♪ ${song.lyrics} ♪`);  // Show the words while BMO sings them
    await wait(600);
    await sing(song.lyrics, () => bmoSongs.playMelody(song.melody as SongMelody));
  }, [interrupt, sing]);

  // Sing one of the special friend's songs at random
  const singForFriend = useCallback(
    () => singSong(FRIEND_SONGS[Math.floor(Math.random() * FRIEND_SONGS.length)]),
    [singSong]
  );

  const send = useCallback(async (userMessage: string) => {
    const text = userMessage.trim();
    if (!text) return;

    // Easter eggs first: some replace the chat, others (like modes) change it
    const egg = detectPhrase(text);
    if (egg === 'originalSong') {
      await singSong('original');
      return;
    }
    if (egg === 'sing' && isSpecialRef.current) {
      await singForFriend();
      return;
    }
    if (egg && onEasterEggRef.current(egg)) {
      // Handled by the app (e.g. click it, BMO chop): keep it in the visible chat only
      setDisplayMessages(prev => [...prev, { role: 'user', text }]);
      return;
    }

    // Is this the special friend introducing themselves?
    let extra: ChatContext = {};
    if (!isSpecialRef.current) {
      const name = extractIntroName(text, askedNameRef.current);
      if (name) {
        const result = await recogniseFriend(name).catch(() => ({ special: false as const }));
        if (result.special && result.name) {
          onRecognisedRef.current(result.name, result.pronouns || '');
          isSpecialRef.current = true;
          extra = { special: true, justRecognised: true };
        }
      }
    }

    await converse({ role: 'user', text }, text, extra);
  }, [converse, singSong, singForFriend]);

  const tellStory = useCallback(async () => {
    const prompt = STORY_PROMPTS[Math.floor(Math.random() * STORY_PROMPTS.length)];
    await converse({ role: 'user', text: STORY_LABEL, kind: 'story' }, prompt);
  }, [converse]);

  // Personal hello on waking. Returns false if it couldn't be fetched (caller falls back).
  const greet = useCallback(async (info: { hoursAway: number; hour: number; visits: number }) => {
    setMood('thinking');
    let reply: string;
    try {
      reply = await streamReply({ greeting: info, context: chatContext() });
    } catch (error) {
      if (error instanceof ReplySuperseded) return true;  // Friend already moved on
      console.warn('Greeting failed, using the default hello:', error);
      setMood('happy');
      return false;
    }
    const entry: HistoryMessage = { role: 'assistant', text: reply };
    historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }];
    setDisplayMessages(prev => [...prev, entry]);
    onMessagesRef.current([entry]);
    await finishSpeaking();
    return true;
  }, [streamReply, finishSpeaking]);

  // BMO starts a conversation by itself. Returns false if it couldn't.
  const nudge = useCallback(async () => {
    let reply: string;
    try {
      reply = await streamReply({ nudge: true, history: recentForApi(historyRef.current), context: chatContext() });
    } catch (error) {
      if (!(error instanceof ReplySuperseded)) console.warn('BMO could not start a conversation:', error);
      setMood('happy');
      return false;
    }
    const entry: HistoryMessage = { role: 'assistant', text: reply };
    historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }];
    setDisplayMessages(prev => [...prev, entry]);
    onMessagesRef.current([entry]);
    await finishSpeaking();
    return true;
  }, [streamReply, finishSpeaking]);

  // Say a short pre-written line (games, pokes, waking from a doze)
  const quickLine = useCallback(async (text: string, lineMood: Mood, spoken: boolean) => {
    setMood(lineMood);
    setCaption(text);
    if (spoken) await say(text);
  }, [say]);

  // Forget the conversation (used by "Forget everything")
  const reset = useCallback(() => {
    interrupt();
    historyRef.current = [];
    setDisplayMessages([]);
    setCaption('');
    setMood('happy');
  }, [interrupt]);

  return {
    mood,
    setMood,
    caption,
    setCaption,
    isThinking,
    isSinging,
    displayMessages,
    send,
    tellStory,
    greet,
    sing,
    singForFriend,
    nudge,
    quickLine,
    interrupt,
    reset
  };
};
