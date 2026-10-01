// Keeps BMO's voice clips on this device (Cache Storage), so lines BMO repeats
// play instantly, work offline, and don't cost another voice request.
// Everything fails safe: any problem just means the clip is fetched again.

const CACHE_NAME = 'bmo-voice-v1';
const INDEX_KEY = 'bmo-voice-index';  // text key -> last used (ms), for evicting old clips
const MAX_CLIPS = 150;
const TIMEOUT_MS = 1000;

// Same normalisation as the server's voice cache: "Hello, friend!" and "hello friend" match
export const voiceKey = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim() || text;

// Cache Storage needs a URL-shaped key
const keyUrl = (key: string) => `https://bmo.voice/${encodeURIComponent(key)}`;

const withTimeout = <T,>(promise: Promise<T>): Promise<T | null> =>
  Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), TIMEOUT_MS))]);

const available = () => typeof caches !== 'undefined';

const readIndex = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeIndex = (index: Record<string, number>) => {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Not critical
  }
};

export const getClip = async (text: string): Promise<Blob | null> => {
  if (!available()) return null;
  try {
    const key = voiceKey(text);
    const response = await withTimeout(caches.open(CACHE_NAME).then(cache => cache.match(keyUrl(key))));
    if (!response) return null;
    const blob = await withTimeout(response.blob());
    if (!blob || blob.size === 0) return null;
    const index = readIndex();
    index[key] = Date.now();
    writeIndex(index);
    return blob;
  } catch {
    return null;
  }
};

export const putClip = async (text: string, blob: Blob): Promise<void> => {
  if (!available()) return;
  try {
    const key = voiceKey(text);
    const cache = await withTimeout(caches.open(CACHE_NAME));
    if (!cache) return;
    await withTimeout(cache.put(keyUrl(key), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } })));

    // Remember when it was used, and drop the least recently used clips beyond the limit
    const index = readIndex();
    index[key] = Date.now();
    const keys = Object.keys(index).sort((a, b) => index[a] - index[b]);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CLIPS))) {
      delete index[old];
      cache.delete(keyUrl(old)).catch(() => {});
    }
    writeIndex(index);
  } catch {
    // Storage full or blocked - BMO just fetches the voice next time
  }
};
