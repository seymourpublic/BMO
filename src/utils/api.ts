import { Message } from '../types';
import { persistentCache } from './persistentCache';
import { MemoryPayload } from './memory';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const CONFUSED = "Oh no! BMO's circuits got confused! BMO needs a moment...";

// If a reply was cut off, end it at the last full sentence
export const trimToSentence = (text: string): string => {
  const trimmed = text.trimEnd();
  const lastEnd = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf('!'), trimmed.lastIndexOf('?'));
  return lastEnd > trimmed.length * 0.4 ? trimmed.slice(0, lastEnd + 1) : trimmed;
};

// --- Waking the backend ---
// The free hosting plan puts the backend to sleep when nobody uses it, and waking takes
// 30-60 s. The app pings it as soon as the page opens, and requests retry while it wakes.

// Waits between retries when the backend can't be reached (total ~37 s)
const RETRY_DELAYS_MS = [2000, 5000, 10000, 20000];

let onWaking: (() => void) | null = null;
// The app shows "BMO is waking up its brain..." while requests are retrying
export const setWakingListener = (listener: (() => void) | null) => {
  onWaking = listener;
};

// Start waking the backend without waiting for it
export const wakeBackend = () => {
  fetch(`${API_BASE_URL}/health`).catch(() => { /* Still asleep; requests will retry */ });
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

const sleep = (ms: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

// fetch() to the backend, retrying if it can't be reached (asleep or waking up).
// HTTP errors are returned as-is; only network failures retry.
export const fetchBackend = async (path: string, init: RequestInit = {}, retries = RETRY_DELAYS_MS.length): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(`${API_BASE_URL}${path}`, init);
    } catch (error) {
      if (isAbort(error) || attempt >= retries) throw error;
      if (attempt === 0) onWaking?.();
      console.warn(`Backend not reachable yet (attempt ${attempt + 1}), retrying...`);
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)], init.signal);
    }
  }
};

const postJson = async (path: string, body: unknown, init: RequestInit = {}): Promise<Response> => {
  try {
    return await fetchBackend(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...init
    }, init.keepalive ? 0 : undefined);  // A page that's closing can't wait to retry
  } catch (error) {
    if (isAbort(error)) throw error;  // Cancelled on purpose
    console.error('Error communicating with BMO backend:', error);
    throw new Error("BMO can't reach its brain! Is the backend server running?");
  }
};

const throwForStatus = async (response: Response) => {
  if (response.ok) return;
  const errorData = await response.json().catch(() => ({}));
  console.error('BMO backend error:', response.status, errorData);
  if (response.status === 429) {
    throw new Error(errorData.error || 'BMO needs a little rest! Try again in a moment.');
  }
  throw new Error(CONFUSED);
};

export type ChatMode = 'detective' | 'football';

export interface Occasion {
  id: string;
  kind: 'birthday' | 'met';
  message: string;
}

// Extra context that changes how BMO replies (all validated by the server)
export interface ChatContext {
  mode?: ChatMode;
  hour?: number;            // Friend's local hour, for bedtime BMO
  now?: string;             // Friend's local date and time in words
  occasion?: Occasion['kind'];  // A special day for the special friend
  special?: boolean;        // Talking with the special friend BMO was made for
  justRecognised?: boolean; // The special friend has just introduced themselves
}

interface StreamOptions {
  history?: Message[];
  nudge?: boolean;          // BMO starts the conversation (history is optional context)
  context?: ChatContext;
  greeting?: { hoursAway: number; hour: number; visits: number };
  memory: MemoryPayload | null;
  onText: (delta: string) => void;  // Called with each new piece of the reply
  signal?: AbortSignal;             // Cancels the request (e.g. the friend interrupted)
}

// Stream BMO's reply as it's written. Resolves with the full reply text.
// If the connection drops after some text arrived, resolves with what arrived.
export const streamChat = async ({ history, greeting, nudge, memory, onText, signal, context = {} }: StreamOptions): Promise<string> => {
  // Normal chats can come from the device cache (greetings, nudges and first meetings are always fresh)
  const cacheInput = history && !nudge && !context.justRecognised ? { history, memory, context } : null;
  if (cacheInput) {
    const cached = await persistentCache.get(cacheInput);
    if (cached) {
      console.log('⚡ Cache hit (streamed in one piece)');
      onText(cached);
      return cached;
    }
  }

  const body = greeting ? { greeting, memory, ...context }
    : nudge ? { nudge: true, messages: history, memory, ...context }
    : { messages: history, memory, ...context };
  const response = await postJson('/api/chat/stream', body, { signal });
  await throwForStatus(response);
  if (!response.body) throw new Error(CONFUSED);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason: string | undefined;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Server-Sent Events are separated by a blank line
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (!line.startsWith('data:')) continue;
        const event = JSON.parse(line.slice(5));
        if (event.type === 'text') {
          text += event.text;
          onText(event.text);
        } else if (event.type === 'done') {
          stopReason = event.stop_reason;
        } else if (event.type === 'error') {
          throw new Error(event.error || CONFUSED);
        }
      }
    }
  } catch (error) {
    // Keep a partial reply rather than throwing it away
    if (!text) throw error instanceof Error ? error : new Error(CONFUSED);
    console.warn('Reply stream broke early; keeping what arrived:', error);
    return trimToSentence(text);
  }

  if (!text) throw new Error(CONFUSED);
  const reply = stopReason === 'max_tokens' ? trimToSentence(text) : text;
  if (cacheInput && stopReason === 'end_turn') {
    await persistentCache.set(cacheInput, reply, 1800000);
  }
  return reply;
};

// Ask the backend to update BMO's memory from recent messages.
// `keepalive` lets it finish even if the page is closing.
export const rememberConversation = async (
  memory: MemoryPayload,
  messages: Message[],
  keepalive = false
): Promise<MemoryPayload> => {
  const response = await postJson('/api/remember', { memory, messages }, { keepalive });
  await throwForStatus(response);
  const data = await response.json();
  return data.memory as MemoryPayload;
};

// Is this the special friend BMO was made for? The name is checked on the server.
export const recogniseFriend = async (name: string): Promise<{ special: boolean; name?: string; pronouns?: string }> => {
  const response = await postJson('/api/special/recognise', { name });
  if (!response.ok) return { special: false };
  return response.json();
};

// Lyrics + melody for a special song (kept on the server, not in this code)
export const fetchSong = async (id: string, special: boolean): Promise<{ lyrics: string; melody: string } | null> => {
  const response = await postJson('/api/special/song', { id, special });
  if (!response.ok) return null;
  return response.json();
};

// Is today a special day for the special friend? (The dates stay on the server.)
export const fetchTodaysOccasion = async (date: Date = new Date()): Promise<Occasion | null> => {
  const response = await postJson('/api/special/today', { month: date.getMonth() + 1, day: date.getDate(), special: true });
  if (!response.ok) return null;
  const data = await response.json();
  return data.occasion ?? null;
};
