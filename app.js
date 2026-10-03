// BMO backend app: proxies BMO's chat to Anthropic and voice to Fish Audio.
// server.js starts it; tests import it directly (see app.test.js).
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import {
  BMO_PERSONALITY, buildMemoryBlock, buildGreetingTurn, buildModeBlock, buildTimeBlock, buildSpecialBlock,
  buildWeatherBlock, buildOccasionBlock, buildPhotoTurn, buildFollowUpLine, buildMilestoneTurn, MILESTONES,
  buildKitchenBlock, NUDGE_TURN, REMEMBER_PROMPT, RECIPE_PROMPT, QUIZ_PROMPT, QUIZ_CHECK_PROMPT,
  FASHION_ACCESSORIES, buildFashionPrompt, FASHION_FINALE_PROMPT
} from './personality.js';
import { lookupWeather, weatherForChat } from './weather.js';
import {
  CRISIS_CHECK_PROMPT, buildAlertMessage, buildCrisisBlock, createOwnerNotifier, nextCrisisState, sanitizeCrisisCheck,
  screenForCrisis, shouldAlert
} from './crisis.js';


// Load environment variables
dotenv.config();

// The special friend BMO was made for. Private: from the BMO_SPECIAL_JSON env var (Railway),
// else the git-ignored special.local.js, else the placeholder special.example.js.
async function loadSpecialConfig() {
  if (process.env.BMO_SPECIAL_JSON) {
    try {
      console.log('💝 Special friend config loaded from BMO_SPECIAL_JSON');
      return JSON.parse(process.env.BMO_SPECIAL_JSON);
    } catch (error) {
      console.error('❌ BMO_SPECIAL_JSON is not valid JSON:', error.message);
    }
  }
  for (const file of ['./special.local.js', './special.example.js']) {
    try {
      const config = (await import(file)).default;
      console.log(`💝 Special friend config loaded from ${file}`);
      return config;
    } catch {
      // Try the next source
    }
  }
  return null;
}
const special = await loadSpecialConfig();
// Which special occasion (if any) falls on this date. A day-less occasion covers the whole month.
export const matchOccasion = (occasions, month, day) =>
  (occasions || []).find(o => o.month === month && (o.day === undefined || o.day === null || o.day === day)) || null;

const isSpecialName = name =>
  !!special && typeof name === 'string' && name.trim().toLowerCase() === special.friendName.toLowerCase();

// Anthropic client (reads ANTHROPIC_API_KEY; retries network errors, 429s and 5xx).
// Only created when the key exists so a missing key can't stop the server starting;
// the chat endpoints report the missing key instead.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export const app = express();
const JSON_BODY_LIMIT = '256kb';
const PHOTO_BODY_LIMIT = '1mb';           // Only the chat stream accepts a (shrunk) photo
const MAX_IMAGE_BYTES = 300 * 1024;       // Photos are shrunk on the device to well under this
const IMAGE_KINDS = ['snapshot', 'memory', 'dish'];
const MAX_CAPTION_CHARS = 200;

// Chat request limits
const MAX_CHAT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const CHAT_RATE_LIMIT = 20;              // requests per window per IP
const CHAT_RATE_WINDOW = 60 * 1000;      // 1 minute
const chatRateLimits = new Map();        // ip -> recent request timestamps

// Memory limits (memory lives on the user's device and is sent with requests)
const MEMORY_LIMITS = { name: 40, pronouns: 40, personality: 300, noteChars: 120, notes: 20 };
// Growing BMO: limits shared with src/utils/memory.ts (GROWTH_LIMITS)
const GROWTH_LIMITS = { words: 15, wordChars: 40, meaningChars: 80, diaryInChat: 3, diaryChars: 160, followUpChars: 120 };
const NEW_PER_REFLECTION = 3;      // Follow-ups / words one memory update may add
const FOLLOW_UP_MAX_DAYS = 60;     // How far ahead a follow-up may be scheduled
const MAX_REMEMBER_MESSAGES = 30;
const CLAUDE_MODEL = 'claude-haiku-4-5';  // Fastest model; ~1.8s, short spoken-length replies

// Backend response cache
const responseCache = new Map();
const ttsCache = new Map();  // TTS audio cache
const inFlightRequests = new Map();  // Request deduplication for Claude
const inFlightTTS = new Map();  // Request deduplication for TTS
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const TTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour for TTS (audio doesn't change)
const MAX_TTS_CACHE_SIZE = 50; // Max 50 cached audio files

// Generate cache key from messages (+ anything else that changes the reply, like memory)
function generateCacheKey(messages, extra = '') {
  const keyString = messages.map(m => `${m.role}:${m.content}`).join('|') + '#' + extra;
  let hash = 0;
  for (let i = 0; i < keyString.length; i++) {
    const char = keyString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `backend_${Math.abs(hash)}`;
}

// Generate TTS cache key from text (with normalization for better hit rate)
function generateTTSCacheKey(text) {
  // Normalize text: lowercase, remove punctuation, trim
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // Remove punctuation (keeps letters in any script)
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim() || text;          // Fall back to raw text if nothing is left (e.g. only emoji)

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `tts_${Math.abs(hash)}`;
  
  // Now "Hello!" and "hello" produce same cache key! ✅
}

// Clean expired cache entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let removed = 0;
  
  // Clean response cache
  for (const [key, entry] of responseCache.entries()) {
    if (now > entry.expiresAt) {
      responseCache.delete(key);
      removed++;
    }
  }
  
  // Clean TTS cache
  for (const [key, entry] of ttsCache.entries()) {
    if (now > entry.expiresAt) {
      ttsCache.delete(key);
      removed++;
    }
  }
  
  // Enforce TTS cache size limit
  if (ttsCache.size > MAX_TTS_CACHE_SIZE) {
    const entriesToRemove = ttsCache.size - MAX_TTS_CACHE_SIZE;
    const sortedEntries = Array.from(ttsCache.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    
    for (let i = 0; i < entriesToRemove; i++) {
      ttsCache.delete(sortedEntries[i][0]);
      removed++;
    }
  }
  
  // Drop rate-limit entries with no recent requests
  for (const [ip, timestamps] of chatRateLimits.entries()) {
    if (!timestamps.some(t => now - t < CHAT_RATE_WINDOW)) {
      chatRateLimits.delete(ip);
    }
  }

  if (removed > 0) {
    console.log(`🧹 Cleaned ${removed} expired cache entries`);
    console.log(`   Response cache: ${responseCache.size}, TTS cache: ${ttsCache.size}`);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();  // Don't keep the process alive just for cache cleanup (matters for tests)

// The host (Render/Railway) sits behind a proxy - trust it so req.ip is the real client IP
app.set('trust proxy', 1);

// Frontend address(es) from FRONTEND_URL: comma-separated, and forgiving about a trailing
// slash or path, since browsers send the origin without them ("https://x.vercel.app")
const frontendOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(url => {
    const trimmed = url.trim();
    try {
      return trimmed ? new URL(trimmed).origin : '';
    } catch {
      console.warn(`⚠️ Ignoring invalid FRONTEND_URL entry: "${trimmed}"`);
      return '';
    }
  })
  .filter(Boolean);

// Enable CORS for our own frontend only
const vercelPrefix = (process.env.VERCEL_PROJECT_PREFIX || '').replace(/[^a-z0-9-]/gi, '');
app.use(cors({
  origin: [
    'http://localhost:3000',  // Local development
    'http://localhost:5173',  // Vite dev server alternative port
    ...frontendOrigins,       // Production frontend (Vercel)
    // This project's Vercel preview deployments, e.g. https://bmo-abc123.vercel.app
    vercelPrefix && new RegExp(`^https://${vercelPrefix}[a-z0-9-]*\\.vercel\\.app$`)
  ].filter(Boolean),          // Remove empty values
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
// Small JSON bodies everywhere, except the chat stream, which may carry one shrunk photo
const smallJson = express.json({ limit: JSON_BODY_LIMIT });
const photoJson = express.json({ limit: PHOTO_BODY_LIMIT });
const PHOTO_ROUTES = new Set(['/api/chat/stream', '/api/recipe', '/api/quiz', '/api/fashion']);
app.use((req, res, next) => (PHOTO_ROUTES.has(req.path) ? photoJson : smallJson)(req, res, next));

// Health check endpoint
app.get('/health', (req, res) => {
  lookupWeather(req.ip);  // The page pings /health on load: get the weather ready for the first chat
  res.json({ 
    status: 'ok', 
    message: 'BMO backend is running!',
    cache: {
      responses: responseCache.size,
      tts: ttsCache.size,
      inFlightRequests: inFlightRequests.size,
      inFlightTTS: inFlightTTS.size
    }
  });
});

// Shared TTS generation logic (used by /api/tts and /api/preload)
async function generateTTSAudio(text) {
  const fishApiKey = process.env.FISH_AUDIO_API_KEY;
  if (!fishApiKey) throw new Error('Fish Audio API key not configured on server');

  const cacheKey = generateTTSCacheKey(text);

  const cached = ttsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.audio;
  }

  if (inFlightTTS.has(cacheKey)) {
    return inFlightTTS.get(cacheKey);
  }

  const bmoVoiceId = '323847d4c5394c678e5909c2206725f6';

  const ttsPromise = (async () => {
    const startTime = Date.now();
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fishApiKey}`,
      },
      body: JSON.stringify({
        reference_id: bmoVoiceId,
        text,
        format: 'mp3',
        latency: 'balanced',
        streaming: false,
        mp3_bitrate: 128
      })
    });

    console.log('📡 Fish Audio response:', response.status, `(${Date.now() - startTime}ms)`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Fish Audio API error:', response.status, errorData);
      throw new Error(`TTS API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const sizeKB = (audioBuffer.byteLength / 1024).toFixed(2);
    console.log(`✅ Audio generated: ${sizeKB} KB in ${Date.now() - startTime}ms`);

    const audioBufferNode = Buffer.from(audioBuffer);
    ttsCache.set(cacheKey, {
      audio: audioBufferNode,
      createdAt: Date.now(),
      expiresAt: Date.now() + TTS_CACHE_TTL,
      text: text.substring(0, 50)
    });
    console.log(`💾 Cached audio (cache size: ${ttsCache.size}/${MAX_TTS_CACHE_SIZE})`);

    return audioBufferNode;
  })();

  inFlightTTS.set(cacheKey, ttsPromise);
  try {
    return await ttsPromise;
  } finally {
    inFlightTTS.delete(cacheKey);
  }
}

// Preload common phrases endpoint
app.post('/api/preload', async (req, res) => {
  const commonPhrases = [
    "Hello friend!",
    "How can I help you?",
    "I understand!",
    "That's interesting!",
    "Let me think about that",
    "Is there anything else?",
    "I'm here to help!"
  ];

  console.log('🔥 Preloading common phrases...');
  let preloaded = 0;

  for (const phrase of commonPhrases) {
    const cacheKey = generateTTSCacheKey(phrase);
    if (!ttsCache.has(cacheKey)) {
      generateTTSAudio(phrase).catch(() => {});
      preloaded++;
    }
  }

  res.json({
    message: 'Preloading initiated',
    phrases: commonPhrases.length,
    toPreload: preloaded
  });
});

// Returns an error string if the chat messages are invalid, otherwise null
function validateMessages(messages, maxMessages = MAX_CHAT_MESSAGES) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'Messages must be a non-empty array';
  }
  if (messages.length > maxMessages) {
    return `Too many messages (max ${maxMessages})`;
  }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return 'Each message role must be "user" or "assistant"';
    }
    if (typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_CHARS) {
      return `Each message must be text of at most ${MAX_MESSAGE_CHARS} characters`;
    }
  }
  return null;
}

// Sliding-window rate limit per IP. Returns true if the request is allowed.
function allowChatRequest(ip) {
  const now = Date.now();
  const recent = (chatRateLimits.get(ip) || []).filter(t => now - t < CHAT_RATE_WINDOW);
  const allowed = recent.length < CHAT_RATE_LIMIT;
  if (allowed) recent.push(now);
  chatRateLimits.set(ip, recent);
  return allowed;
}

const isShortString = (value, max) => typeof value === 'string' && value.length <= max;

// Validate memory sent from the device. Returns { memory } (null if absent) or { error }.
function validateMemory(memory) {
  if (memory === undefined || memory === null) return { memory: null };
  if (typeof memory !== 'object' || Array.isArray(memory)) return { error: 'Memory must be an object' };
  const { name = '', pronouns = '', personality = '', notes = [] } = memory;
  if (!isShortString(name, MEMORY_LIMITS.name)) return { error: `Memory name must be at most ${MEMORY_LIMITS.name} characters` };
  if (!isShortString(pronouns, MEMORY_LIMITS.pronouns)) return { error: `Memory pronouns must be at most ${MEMORY_LIMITS.pronouns} characters` };
  if (!isShortString(personality, MEMORY_LIMITS.personality)) return { error: `Memory personality must be at most ${MEMORY_LIMITS.personality} characters` };
  if (!Array.isArray(notes) || notes.length > MEMORY_LIMITS.notes || !notes.every(n => isShortString(n, MEMORY_LIMITS.noteChars))) {
    return { error: `Memory notes must be at most ${MEMORY_LIMITS.notes} texts of ${MEMORY_LIMITS.noteChars} characters` };
  }
  const { words = [], diary = [] } = memory;
  const validWord = w => w && typeof w === 'object' && isShortString(w.word, GROWTH_LIMITS.wordChars) &&
    (w.meaning === undefined || isShortString(w.meaning, GROWTH_LIMITS.meaningChars));
  if (!Array.isArray(words) || words.length > GROWTH_LIMITS.words || !words.every(validWord)) {
    return { error: `Memory words must be at most ${GROWTH_LIMITS.words} short words` };
  }
  if (!Array.isArray(diary) || diary.length > GROWTH_LIMITS.diaryInChat || !diary.every(l => isShortString(l, GROWTH_LIMITS.diaryChars))) {
    return { error: `Memory diary must be at most ${GROWTH_LIMITS.diaryInChat} lines of ${GROWTH_LIMITS.diaryChars} characters` };
  }
  return {
    memory: {
      name: name.trim(), pronouns: pronouns.trim(), personality: personality.trim(),
      notes: notes.map(n => n.trim()).filter(Boolean),
      words: words.map(w => ({ word: w.word.trim(), ...(w.meaning?.trim() ? { meaning: w.meaning.trim() } : {}) })).filter(w => w.word),
      diary: diary.map(l => l.trim()).filter(Boolean)
    }
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = day => DATE_PATTERN.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) &&
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
const addDaysUtc = (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// Clamp the "growing" part of a memory update: new follow-ups, words and a diary line
export function sanitizeGrowth(raw, today) {
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const latest = addDaysUtc(today, FOLLOW_UP_MAX_DAYS);
  const followUps = (Array.isArray(raw?.followUps) ? raw.followUps : [])
    .map(f => ({ about: text(f?.about, GROWTH_LIMITS.followUpChars), askAfter: typeof f?.askAfter === 'string' ? f.askAfter : '' }))
    .filter(f => f.about && isRealDate(f.askAfter) && f.askAfter >= today && f.askAfter <= latest)
    .slice(0, NEW_PER_REFLECTION);
  const words = (Array.isArray(raw?.words) ? raw.words : [])
    .map(w => ({ word: text(w?.word, GROWTH_LIMITS.wordChars), meaning: text(w?.meaning, GROWTH_LIMITS.meaningChars) }))
    .filter(w => w.word)
    .map(w => (w.meaning ? w : { word: w.word }))
    .slice(0, NEW_PER_REFLECTION);
  return { followUps, words, diary: text(raw?.diary, GROWTH_LIMITS.diaryChars) };
}

// Greeting requests only carry numbers; clamp them to sensible ranges
function validateGreeting(greeting) {
  if (!greeting || typeof greeting !== 'object') return null;
  const num = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  return {
    hoursAway: num(greeting.hoursAway, 0, 24 * 365, 0),
    hour: Math.floor(num(greeting.hour, 0, 23, 12)),
    visits: Math.floor(num(greeting.visits, 1, 1_000_000, 1))
  };
}

// Call the Anthropic Messages API and return the message.
// The SDK retries connection errors, 429s and 5xx on its own.
async function callClaude({ system, messages, maxTokens }) {
  try {
    return await anthropic.messages.create({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('❌ Anthropic API error:', error.status, error.message);
    }
    throw error;
  }
}

const REPLY_MAX_TOKENS = 300;     // Short replies are faster to write and to speak
const GREETING_MAX_TOKENS = 150;

// --- Crisis mode ---
// The alert channel is added later (special.alert); until then alerts are only noted in the log
const notifyOwner = createOwnerNotifier({ send: null });

// Notice how the friend is feeling, update the crisis state, and alert the owner if they may be in danger.
// Returns { state, alerted } for the reply. A failed check never raises an alert.
async function assessCrisis(clientState, messages, latestUser, isSpecialFriend) {
  const current = nextCrisisState(clientState, null);  // Cleaned up
  const flagged = screenForCrisis(latestUser);
  if (!flagged && current.level < 2) {
    // Nothing worrying, and nothing heavy going on: a calm turn.
    // Safety net for the special friend: no phrase list catches every way of saying it, so a careful
    // check still runs in the background (without slowing the reply) and can raise the alert.
    if (isSpecialFriend) {
      carefulCrisisCheck(messages).then(check => alertIfInDanger(check, true)).catch(() => {});
    }
    return { state: nextCrisisState(current, { level: 0, kind: 'none', confidence: 1, harmSource: '' }), alerted: false };
  }
  const check = await carefulCrisisCheck(messages);
  // Couldn't check a worrying message: be gentle (at least "hurting"), but never alert on a guess
  if (!check) {
    const state = flagged ? { ...current, level: Math.max(current.level, 3), calmStreak: 0 } : current;
    return { state, alerted: false };
  }
  const state = nextCrisisState(current, check);
  if (state.level >= 3) console.log(`💛 Crisis level ${state.level} (${state.kind})`);  // Never the friend's words
  const alerted = await alertIfInDanger(check, isSpecialFriend);
  return { state, alerted };
}

// The careful check: a small AI call on the last few messages. Null if it couldn't be done.
async function carefulCrisisCheck(messages) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const recent = messages.filter(m => typeof m.content === 'string').slice(-6)
      .map(m => `${m.role === 'user' ? 'Person' : 'BMO'}: ${m.content}`).join('\n');
    const data = await callClaude({ system: CRISIS_CHECK_PROMPT, maxTokens: 150, messages: [{ role: 'user', content: recent }] });
    return sanitizeCrisisCheck(parseJsonObject(data.content?.find(block => block.type === 'text')?.text || ''));
  } catch (error) {
    console.error('⚠️ Crisis check failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Alert the owner if the special friend may be in danger. Returns true if the owner knows.
async function alertIfInDanger(check, isSpecialFriend) {
  if (!isSpecialFriend || !shouldAlert(check, special.alert?.ownerNames || [])) return false;
  console.log(`💛 Crisis level ${check.level} (${check.kind})`);  // Never the friend's words
  const result = await notifyOwner(buildAlertMessage(special.friendName, check.kind));
  return result.alerted;
}

// Validate a chat request and build what to send to Claude.
// Sends an error response and returns null if the request is invalid.
const CHAT_MODES = ['detective', 'football', 'kitchen', 'teach'];
export const QUIZ_LIMITS = { topic: 60, minQuestions: 3, maxQuestions: 8, field: 200, answer: 500, question: 300 };
export const VERDICTS = ['right', 'partly', 'notYet'];
export const FASHION_LIMITS = { award: 40, comment: 220, tip: 120, finaleLine: 200, minLooks: 2, maxLooks: 6 };
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

// Clean up BMO's judging of a look. Always returns something usable.
// Fashion lines are said as-is, so *emotes* are removed rather than read out
const withoutEmotes = v => (typeof v === 'string' ? v.replace(/\*[^*]*\*/g, '').replace(/\s{2,}/g, ' ') : v);

export function sanitizeFashion(raw, style) {
  const L = FASHION_LIMITS;
  const text = (v, max) => (typeof v === 'string' ? withoutEmotes(v).trim().slice(0, max) : '');
  const result = {
    award: text(raw?.award, L.award) || 'Most Fabulous',
    comment: text(raw?.comment, L.comment) || "BMO's judging circuits are dazzled!",
    accessory: FASHION_ACCESSORIES.includes(raw?.accessory) ? raw.accessory : 'bow',
    colour: typeof raw?.colour === 'string' && HEX_COLOUR.test(raw.colour.trim()) ? raw.colour.trim().toLowerCase() : ''
  };
  const tip = style === 'check' ? text(raw?.tip, L.tip) : '';
  return tip ? { ...result, tip } : result;
}

// Clean up the finale. Returns { winner, line } with the winner always in range.
export function sanitizeFinale(raw, count) {
  const winner = Number.isInteger(raw?.winner) && raw.winner >= 0 && raw.winner < count ? raw.winner : 0;
  const cleaned = typeof raw?.line === 'string' ? withoutEmotes(raw.line).trim() : '';
  const line = cleaned ? cleaned.slice(0, FASHION_LIMITS.finaleLine) : '';
  return { winner, line };
}

// Clean up a quiz from the model. Returns { quiz } or { unreadable: true }.
export function sanitizeQuiz(raw) {
  const L = QUIZ_LIMITS;
  if (!raw || typeof raw !== 'object' || raw.unreadable) return { unreadable: true };
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map(item => ({ q: text(item?.q, L.field), answer: text(item?.answer, L.field), why: text(item?.why, L.field) }))
    .filter(item => item.q && item.answer)
    .slice(0, L.maxQuestions);
  if (questions.length < L.minQuestions) return { unreadable: true };
  return { quiz: { topic: text(raw.topic, L.topic) || 'My notes', questions } };
}

// Clean up a judged answer. Returns { verdict, reply } or null if the model's answer was unusable.
export function sanitizeVerdict(raw) {
  if (!raw || !VERDICTS.includes(raw.verdict)) return null;
  const reply = typeof raw.reply === 'string' ? raw.reply.trim().slice(0, 300) : '';
  return reply ? { verdict: raw.verdict, reply } : null;
}
export const RECIPE_LIMITS = { title: 80, servings: 40, ingredients: 25, ingredientChars: 80, steps: 20, stepChars: 240, maxMinutes: 1440, request: 300 };

// The recipe and step sent with kitchen-mode chats. Returns { kitchen } (null if absent) or { error }.
function validateKitchen(kitchen) {
  if (kitchen === undefined || kitchen === null) return { kitchen: null };
  const L = RECIPE_LIMITS;
  const ok = kitchen && typeof kitchen === 'object' &&
    isShortString(kitchen.title, L.title) && isShortString(kitchen.step, L.stepChars) &&
    Number.isInteger(kitchen.stepNumber) && Number.isInteger(kitchen.totalSteps) &&
    kitchen.stepNumber >= 1 && kitchen.totalSteps <= L.steps && kitchen.stepNumber <= kitchen.totalSteps &&
    Array.isArray(kitchen.ingredients) && kitchen.ingredients.length <= L.ingredients &&
    kitchen.ingredients.every(i => isShortString(i, L.ingredientChars));
  if (!ok) return { error: 'Kitchen context must be a short recipe title, step and ingredients' };
  const { title, step, stepNumber, totalSteps, ingredients } = kitchen;
  return { kitchen: { title, step, stepNumber, totalSteps, ingredients } };
}

// Clean up a recipe from the model. Returns { recipe } or { unreadable: true }.
export function sanitizeRecipe(raw, fromPhoto) {
  const L = RECIPE_LIMITS;
  if (!raw || typeof raw !== 'object' || raw.unreadable) return { unreadable: true };
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v, count, max) => (Array.isArray(v) ? v : []).map(x => text(x, max)).filter(Boolean).slice(0, count);
  const title = text(raw.title, L.title);
  const steps = list(raw.steps, L.steps, L.stepChars);
  if (!title || steps.length === 0) return { unreadable: true };
  const minutes = Number.isFinite(raw.minutes) ? Math.round(Math.min(L.maxMinutes, Math.max(0, raw.minutes))) : 0;
  return {
    recipe: {
      title,
      servings: text(raw.servings, L.servings),
      minutes,
      ingredients: list(raw.ingredients, L.ingredients, L.ingredientChars),
      steps,
      fromPhoto: !!fromPhoto,
      bmoVersion: !fromPhoto && raw.bmoVersion === true
    }
  };
}

const MAX_NOW_CHARS = 60;
const OCCASION_KINDS = ['birthday', 'met'];

// Check a photo sent for BMO to look at. Returns { image } (null if none) or { error }.
// The photo is never logged, cached or stored.
export function validateImage(image) {
  if (image === undefined || image === null) return { image: null };
  const match = typeof image === 'string' && /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match) return { error: 'Image must be a JPEG or PNG data URL' };
  const bytes = Math.floor(match[2].length * 3 / 4);
  if (bytes > MAX_IMAGE_BYTES) return { error: `Image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024)} KB after shrinking)` };
  return { image: { mediaType: match[1], data: match[2] } };
}

async function prepareChat(req, res) {
  const greeting = validateGreeting(req.body.greeting);
  const { mode, hour, now, nudge, occasion, imageKind, caption, followUp, milestone, special: isSpecial, justRecognised } = req.body;
  if (followUp !== undefined && followUp !== null && !isShortString(followUp, GROWTH_LIMITS.followUpChars)) {
    res.status(400).json({ error: `followUp must be at most ${GROWTH_LIMITS.followUpChars} characters` });
    return null;
  }
  if (milestone !== undefined && milestone !== null && !Object.hasOwn(MILESTONES, milestone)) {
    res.status(400).json({ error: 'Unknown milestone' });
    return null;
  }
  const { image, error: imageError } = validateImage(req.body.image);
  if (imageError) {
    res.status(400).json({ error: imageError });
    return null;
  }
  if (image && (!IMAGE_KINDS.includes(imageKind) || (caption !== undefined && !(typeof caption === 'string' && caption.length <= MAX_CAPTION_CHARS)))) {
    res.status(400).json({ error: `A photo needs imageKind (${IMAGE_KINDS.join(' or ')}) and an optional short caption` });
    return null;
  }
  if (occasion !== undefined && occasion !== null && !OCCASION_KINDS.includes(occasion)) {
    res.status(400).json({ error: `Occasion must be one of: ${OCCASION_KINDS.join(', ')}` });
    return null;
  }
  if (now !== undefined && now !== null && !(typeof now === 'string' && now.length <= MAX_NOW_CHARS)) {
    res.status(400).json({ error: `"now" must be a short date/time text (max ${MAX_NOW_CHARS} characters)` });
    return null;
  }
  if (mode !== undefined && mode !== null && !CHAT_MODES.includes(mode)) {
    res.status(400).json({ error: `Mode must be one of: ${CHAT_MODES.join(', ')}` });
    return null;
  }
  if (hour !== undefined && hour !== null && !(Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
    res.status(400).json({ error: 'Hour must be a whole number from 0 to 23' });
    return null;
  }
  const { memory, error: memoryError } = validateMemory(req.body.memory);
  if (memoryError) {
    res.status(400).json({ error: memoryError });
    return null;
  }
  const { kitchen, error: kitchenError } = validateKitchen(req.body.kitchen);
  if (kitchenError) {
    res.status(400).json({ error: kitchenError });
    return null;
  }

  // Greetings are built on the server from numbers only; normal chats send messages.
  // A nudge (BMO speaking first) may include recent messages for context, plus a hidden turn.
  let messages;
  if (greeting) {
    messages = [{ role: 'user', content: buildGreetingTurn(greeting) + buildFollowUpLine(followUp) }];
  } else if (image || milestone) {
    // A photo for BMO to look at: recent messages for context (optional), then the photo turn
    const recent = Array.isArray(req.body.messages) && req.body.messages.length ? req.body.messages : null;
    const validationError = recent && validateMessages(recent);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return null;
    }
    messages = [
      ...(recent || []).map(({ role, content }) => ({ role, content })),
      image
        ? {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: buildPhotoTurn(imageKind, caption) }
          ]
        }
        // A milestone to celebrate
        : { role: 'user', content: buildMilestoneTurn(milestone) }
    ];
  } else if (nudge === true) {
    const recent = Array.isArray(req.body.messages) && req.body.messages.length ? req.body.messages : null;
    const validationError = recent && validateMessages(recent);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return null;
    }
    messages = [...(recent || []).map(({ role, content }) => ({ role, content })), { role: 'user', content: NUDGE_TURN + buildFollowUpLine(followUp) }];
  } else {
    const validationError = validateMessages(req.body.messages);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return null;
    }
    messages = req.body.messages.map(({ role, content }) => ({ role, content }));
  }

  if (!allowChatRequest(req.ip)) {
    res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    return null;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ API key not found in environment variables');
    res.status(500).json({ error: 'API key not configured on server' });
    return null;
  }

  // Crisis mode: how is the friend feeling? (Normal chats only; decided here on the server)
  const latestUser = !greeting && !image && !milestone && nudge !== true
    ? [...messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string')?.content
    : undefined;
  const crisis = latestUser ? await assessCrisis(req.body.crisis, messages, latestUser, isSpecial === true) : null;

  const weather = await weatherForChat(req.ip);
  const extras = buildModeBlock(mode) + (mode === 'kitchen' ? buildKitchenBlock(kitchen) : '') +
    buildTimeBlock(hour ?? greeting?.hour, now) + buildWeatherBlock(weather) +
    (isSpecial === true ? buildSpecialBlock(special, justRecognised === true) + buildOccasionBlock(occasion, special) : '');
  // Greetings, nudges, photos, milestones and anything heavy are never cached
  const fresh = !!greeting || nudge === true || !!image || !!milestone || (crisis?.state.level ?? 0) >= 1;
  return {
    greeting,
    memory,
    messages,
    crisis: crisis?.state ?? null,
    // Football takes over BMO's identity, so its instructions also go first where they carry the most weight
    // Crisis guidance goes last, where it carries the most weight (it outranks any mode)
    system: (mode === 'football' ? `${buildModeBlock(mode).trim()}\n\n` : '') + BMO_PERSONALITY + buildMemoryBlock(memory) + extras +
      (crisis ? buildCrisisBlock(crisis.state, { alertSent: crisis.alerted }) : ''),
    cacheKey: fresh ? null : generateCacheKey(messages, JSON.stringify({ memory, extras })),
    maxTokens: fresh ? GREETING_MAX_TOKENS : REPLY_MAX_TOKENS
  };
}

function getCachedReply(cacheKey) {
  const cached = cacheKey && responseCache.get(cacheKey);
  return cached && Date.now() < cached.expiresAt ? cached.data : null;
}

function cacheReply(cacheKey, data) {
  if (!cacheKey) return;
  responseCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });
  // Limit cache size (max 100 entries)
  if (responseCache.size > 100) {
    responseCache.delete(responseCache.keys().next().value);
    console.log('🧹 Cache full - removed oldest entry');
  }
}

// Streaming chat: sends the reply as Server-Sent Events while Claude writes it,
// so the browser can show and speak the first sentence straight away.
// Events: {type:'text', text} (a new piece), {type:'done', stop_reason}, {type:'error', error}
app.post('/api/chat/stream', async (req, res) => {
  const chat = await prepareChat(req, res);
  if (!chat) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Don't let proxies hold the stream back
  });
  const sendEvent = event => res.write(`data: ${JSON.stringify(event)}\n\n`);
  // The app learns the new crisis state before the reply starts
  if (chat.crisis) sendEvent({ type: 'crisis', ...chat.crisis });

  const cached = getCachedReply(chat.cacheKey);
  if (cached) {
    console.log('⚡ Backend cache hit (stream)');
    sendEvent({ type: 'text', text: cached.content.find(block => block.type === 'text')?.text || '' });
    sendEvent({ type: 'done', stop_reason: cached.stop_reason });
    return res.end();
  }

  console.log(chat.greeting ? '👋 Streaming greeting' : `📤 Streaming reply (${chat.messages.length} messages${chat.memory ? ', with memory' : ''})`);
  const stream = anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: chat.maxTokens,
    system: chat.system,
    messages: chat.messages
  });

  // Stop paying for tokens nobody will read if the friend leaves mid-reply
  res.on('close', () => {
    if (!res.writableEnded) stream.abort();
  });
  stream.on('text', text => sendEvent({ type: 'text', text }));

  try {
    const message = await stream.finalMessage();
    cacheReply(chat.cacheKey, message);
    sendEvent({ type: 'done', stop_reason: message.stop_reason });
    console.log('✅ Stream finished');
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) {
      console.log('🛑 Stream stopped: client went away');
      return;
    }
    console.error('💥 Error while streaming:', error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error);
    sendEvent({ type: 'error', error: "Oh no! BMO's circuits got confused! BMO needs a moment..." });
  }
  res.end();
});

// Proxy endpoint for Claude API with caching (non-streaming)
app.post('/api/chat', async (req, res) => {
  try {
    const chat = await prepareChat(req, res);
    if (!chat) return;
    const { messages, system, cacheKey, maxTokens, memory } = chat;

    // Greetings and nudges are never cached or shared, so BMO says something new each time
    if (!cacheKey) {
      console.log(chat.greeting ? '👋 Generating greeting' : '💬 Generating a fresh reply');
      return res.json(await callClaude({ system, messages, maxTokens }));
    }

    // Check backend cache first
    const cached = getCachedReply(cacheKey);
    if (cached) {
      console.log('⚡ Backend cache hit! Instant response');
      return res.json(cached);
    }
    
    // REQUEST DEDUPLICATION: Check if same request is in flight
    if (inFlightRequests.has(cacheKey)) {
      console.log('🔄 Duplicate request detected - waiting for in-flight request...');
      try {
        const result = await inFlightRequests.get(cacheKey);
        return res.json(result);
      } catch (error) {
        // If in-flight request failed, continue to make new request
        console.log('⚠️ In-flight request failed, making new request');
      }
    }
    
    console.log('📤 Forwarding request to Anthropic API...');
    console.log('📝 Messages:', messages.length, memory ? '(with memory)' : '');

    // Create promise for this request
    const requestPromise = (async () => {
      const data = await callClaude({ system, messages, maxTokens });
      console.log('✅ Successfully got response from Anthropic');
      cacheReply(cacheKey, data);
      return data;
    })();
    
    // Store in-flight request
    inFlightRequests.set(cacheKey, requestPromise);
    
    try {
      const result = await requestPromise;
      res.json(result);
    } finally {
      // Clean up in-flight request
      inFlightRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error('💥 Error in chat endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Is this name the special friend BMO was made for?
app.post('/api/special/recognise', (req, res) => {
  if (!allowChatRequest(req.ip)) {
    return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
  }
  const { name } = req.body;
  if (typeof name !== 'string' || name.length > MEMORY_LIMITS.name) {
    return res.status(400).json({ error: 'Name must be a short text' });
  }
  if (!isSpecialName(name)) return res.json({ special: false });
  console.log('💝 Special friend recognised');
  res.json({ special: true, name: special.friendName, pronouns: special.friendPronouns });
});

// Is today a special day for the special friend? Only answers yes/no + the message;
// the dates themselves never leave the server.
app.post('/api/special/today', (req, res) => {
  if (!allowChatRequest(req.ip)) {
    return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
  }
  const { month, day, special: isSpecial } = req.body;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    return res.status(400).json({ error: 'Month and day must be valid numbers' });
  }
  if (isSpecial !== true) return res.json({ occasion: null });
  const found = matchOccasion(special?.occasions, month, day);
  res.json({ occasion: found ? { id: found.id, kind: found.kind, message: found.message } : null });
});

// Lyrics and melody for one of the special songs.
// The original song has generic trigger phrases, so it doesn't need recognition.
app.post('/api/special/song', (req, res) => {
  if (!allowChatRequest(req.ip)) {
    return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
  }
  const { id, special: isSpecial } = req.body;
  const song = special?.songs.find(s => s.id === id);
  if (!song) return res.status(404).json({ error: 'BMO does not know that song' });
  if (id !== 'original' && isSpecial !== true) {
    return res.status(400).json({ error: 'That song is only for someone special' });
  }
  res.json({ lyrics: song.lyrics, melody: song.melody });
});

// Pull the first JSON object out of a model reply (tolerates stray text around it)
function parseJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Clamp whatever the model returned to the memory limits
function clampMemory(raw) {
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const notes = Array.isArray(raw?.notes) ? raw.notes : [];
  return {
    name: text(raw?.name, MEMORY_LIMITS.name),
    pronouns: text(raw?.pronouns, MEMORY_LIMITS.pronouns),
    personality: text(raw?.personality, MEMORY_LIMITS.personality),
    notes: notes.map(n => text(n, MEMORY_LIMITS.noteChars)).filter(Boolean).slice(0, MEMORY_LIMITS.notes)
  };
}

// Turn a recipe photo, a dish name or a fridge list into a recipe BMO can guide the friend through.
// The photo is never logged, cached or stored.
app.post('/api/recipe', async (req, res) => {
  try {
    const { image, error: imageError } = validateImage(req.body.image);
    if (imageError) return res.status(400).json({ error: imageError });
    const { request: ask } = req.body;
    if (ask !== undefined && ask !== null && !isShortString(ask, RECIPE_LIMITS.request)) {
      return res.status(400).json({ error: `Request must be at most ${RECIPE_LIMITS.request} characters` });
    }
    if (!image && !(typeof ask === 'string' && ask.trim())) {
      return res.status(400).json({ error: 'Send a recipe photo or a request' });
    }
    if (!allowChatRequest(req.ip)) {
      return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const askText = typeof ask === 'string' && ask.trim() ? ask.trim() : '';
    const content = image
      ? [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
        { type: 'text', text: `A photo of a recipe.${askText ? ` The friend added: "${askText}"` : ''}` }
      ]
      : `The friend's request: "${askText}"`;
    const data = await callClaude({ system: RECIPE_PROMPT, maxTokens: 1500, messages: [{ role: 'user', content }] });
    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    const result = sanitizeRecipe(parseJsonObject(reply), !!image);
    console.log(result.recipe ? `🍳 Recipe ready: ${result.recipe.steps.length} steps` : '🍳 Recipe unreadable');
    res.json(result);
  } catch (error) {
    console.error('💥 Error in recipe endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// BMO judges an outfit: an award, a comment and a matching accessory. The photo is never logged, cached or stored.
app.post('/api/fashion', async (req, res) => {
  try {
    const { image, error: imageError } = validateImage(req.body.image);
    if (imageError) return res.status(400).json({ error: imageError });
    if (!image) return res.status(400).json({ error: 'Send a photo of the look' });
    const style = req.body.style === 'check' ? 'check' : req.body.style === 'runway' ? 'runway' : null;
    if (!style) return res.status(400).json({ error: 'Style must be runway or check' });
    if (!allowChatRequest(req.ip)) {
      return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }
    const data = await callClaude({
      system: buildFashionPrompt(style),
      maxTokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          { type: 'text', text: style === 'check' ? 'How do I look?' : 'Here is my look for the show!' }
        ]
      }]
    });
    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    const result = sanitizeFashion(parseJsonObject(reply), style);
    console.log(`👗 Look judged: ${result.award} (${result.accessory})`);
    res.json(result);
  } catch (error) {
    console.error('💥 Error in fashion endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// BMO crowns the Look of the Night (award titles only; the photos are never sent again)
app.post('/api/fashion/finale', async (req, res) => {
  try {
    const L = FASHION_LIMITS;
    const { awards } = req.body;
    if (!Array.isArray(awards) || awards.length < L.minLooks || awards.length > L.maxLooks ||
        !awards.every(a => isShortString(a, L.award) && a.trim())) {
      return res.status(400).json({ error: `Send ${L.minLooks} to ${L.maxLooks} award titles` });
    }
    if (!allowChatRequest(req.ip)) {
      return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }
    const data = await callClaude({
      system: FASHION_FINALE_PROMPT,
      maxTokens: 200,
      messages: [{ role: 'user', content: awards.map((a, i) => `${i}: ${a}`).join('\n') }]
    });
    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    res.json(sanitizeFinale(parseJsonObject(reply), awards.length));
  } catch (error) {
    console.error('💥 Error in fashion finale endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Make a short quiz from a photo of study notes. The photo is never logged, cached or stored.
app.post('/api/quiz', async (req, res) => {
  try {
    const { image, error: imageError } = validateImage(req.body.image);
    if (imageError) return res.status(400).json({ error: imageError });
    if (!image) return res.status(400).json({ error: 'Send a photo of your notes' });
    if (!allowChatRequest(req.ip)) {
      return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }
    const data = await callClaude({
      system: QUIZ_PROMPT,
      maxTokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          { type: 'text', text: 'Make a quiz from these notes.' }
        ]
      }]
    });
    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    const result = sanitizeQuiz(parseJsonObject(reply));
    console.log(result.quiz ? `📚 Quiz ready: ${result.quiz.questions.length} questions` : '📚 Notes unreadable');
    res.json(result);
  } catch (error) {
    console.error('💥 Error in quiz endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Judge a quiz answer (spoken answers can be worded any way)
app.post('/api/quiz/check', async (req, res) => {
  try {
    const L = QUIZ_LIMITS;
    const { question, expected, answer } = req.body;
    if (!isShortString(question, L.question) || !question.trim() || !isShortString(expected, L.question) || !expected.trim() ||
        !isShortString(answer, L.answer)) {
      return res.status(400).json({ error: 'Send the question, the expected answer and the friend\'s answer' });
    }
    if (!allowChatRequest(req.ip)) {
      return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }
    const data = await callClaude({
      system: QUIZ_CHECK_PROMPT,
      maxTokens: 300,
      messages: [{ role: 'user', content: `Question: ${question}\nExpected answer: ${expected}\nThe friend said: "${answer}"` }]
    });
    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    const result = sanitizeVerdict(parseJsonObject(reply));
    if (!result) return res.status(502).json({ error: 'BMO could not check that one' });
    res.json(result);
  } catch (error) {
    console.error('💥 Error in quiz check endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update BMO's memory of a friend from recent messages
app.post('/api/remember', async (req, res) => {
  try {
    const { memory, error: memoryError } = validateMemory(req.body.memory);
    if (memoryError) {
      return res.status(400).json({ error: memoryError });
    }

    const { messages } = req.body;
    // The friend's local date (for follow-up dates); fall back to the server's
    const today = typeof req.body.today === 'string' && isRealDate(req.body.today) ? req.body.today : new Date().toISOString().slice(0, 10);
    const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    const validationError = validateMessages(messages, MAX_REMEMBER_MESSAGES);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!allowChatRequest(req.ip)) {
      return res.status(429).json({ error: 'BMO needs a little rest! Try again in a moment.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const current = memory || { name: '', pronouns: '', personality: '', notes: [], words: [] };
    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Friend' : 'BMO'}: ${m.content}`)
      .join('\n');

    const data = await callClaude({
      system: REMEMBER_PROMPT,
      maxTokens: 900,
      messages: [{
        role: 'user',
        content: `Today is ${weekday} ${today}.\n\nCurrent memory:\n${JSON.stringify({ ...current, diary: undefined })}\n\nNew messages:\n${transcript}`
      }]
    });

    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    const parsed = parseJsonObject(reply);
    if (!parsed) {
      console.error('❌ Memory update returned unparseable text:', reply.slice(0, 200));
      return res.status(502).json({ error: 'BMO could not update its memory this time' });
    }

    const updated = clampMemory(parsed);
    const growth = sanitizeGrowth(parsed, today);
    console.log(`🧠 Memory updated (${updated.notes.length} notes, +${growth.followUps.length} follow-ups, +${growth.words.length} words${growth.diary ? ', diary' : ''})`);
    res.json({ memory: updated, growth });
  } catch (error) {
    console.error('💥 Error in remember endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Proxy endpoint for Fish Audio TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const cacheKey = generateTTSCacheKey(text);
    const wasCached = ttsCache.has(cacheKey) && Date.now() < ttsCache.get(cacheKey).expiresAt;

    console.log(wasCached
      ? `💨 TTS Cache HIT: ${text.substring(0, 30)}...`
      : `🔄 TTS Cache MISS - generating audio for: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
    );

    const audioBufferNode = await generateTTSAudio(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-Cache', wasCached ? 'HIT' : 'MISS');
    res.send(audioBufferNode);
  } catch (error) {
    console.error('💥 Error in TTS endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Note: Static files are served by Vercel, not this backend
// This backend only handles API routes

// What the server log prints about CORS on startup
export const corsSummary = () =>
  `${frontendOrigins.length ? frontendOrigins.join(', ') : 'localhost only'}${vercelPrefix ? ` + https://${vercelPrefix}*.vercel.app` : ''}`;
