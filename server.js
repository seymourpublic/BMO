// BMO Backend Server - Proxies requests to Anthropic API
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { BMO_PERSONALITY, buildMemoryBlock, buildGreetingTurn, REMEMBER_PROMPT } from './personality.js';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Anthropic client (reads ANTHROPIC_API_KEY; retries network errors, 429s and 5xx).
// Only created when the key exists so a missing key can't stop the server starting;
// the chat endpoints report the missing key instead.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const app = express();
const PORT = process.env.PORT || 3001;  // Railway sets PORT automatically
const JSON_BODY_LIMIT = '256kb';

// Chat request limits
const MAX_CHAT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const CHAT_RATE_LIMIT = 20;              // requests per window per IP
const CHAT_RATE_WINDOW = 60 * 1000;      // 1 minute
const chatRateLimits = new Map();        // ip -> recent request timestamps

// Memory limits (memory lives on the user's device and is sent with requests)
const MEMORY_LIMITS = { name: 40, pronouns: 40, personality: 300, noteChars: 120, notes: 20 };
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
setInterval(() => {
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

// Railway sits behind a proxy - trust it so req.ip is the real client IP
app.set('trust proxy', 1);

// Enable CORS for our own frontend only
const vercelPrefix = (process.env.VERCEL_PROJECT_PREFIX || '').replace(/[^a-z0-9-]/gi, '');
app.use(cors({
  origin: [
    'http://localhost:3000',  // Local development
    'http://localhost:5173',  // Vite dev server alternative port
    process.env.FRONTEND_URL, // Production Vercel URL
    // This project's Vercel preview deployments, e.g. https://bmo-abc123.vercel.app
    vercelPrefix && new RegExp(`^https://${vercelPrefix}[a-z0-9-]*\\.vercel\\.app$`)
  ].filter(Boolean),          // Remove undefined values
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json({ limit: JSON_BODY_LIMIT }));

// Health check endpoint
app.get('/health', (req, res) => {
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
  return { memory: { name: name.trim(), pronouns: pronouns.trim(), personality: personality.trim(), notes: notes.map(n => n.trim()).filter(Boolean) } };
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

// Validate a chat request and build what to send to Claude.
// Sends an error response and returns null if the request is invalid.
function prepareChat(req, res) {
  const greeting = validateGreeting(req.body.greeting);
  const { memory, error: memoryError } = validateMemory(req.body.memory);
  if (memoryError) {
    res.status(400).json({ error: memoryError });
    return null;
  }

  // Greetings are built on the server from numbers only; normal chats send messages
  let messages;
  if (greeting) {
    messages = [{ role: 'user', content: buildGreetingTurn(greeting) }];
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

  return {
    greeting,
    memory,
    messages,
    system: BMO_PERSONALITY + buildMemoryBlock(memory),
    // Greetings aren't cached so BMO says hello differently each time
    cacheKey: greeting ? null : generateCacheKey(messages, JSON.stringify(memory)),
    maxTokens: greeting ? GREETING_MAX_TOKENS : REPLY_MAX_TOKENS
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
  const chat = prepareChat(req, res);
  if (!chat) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Don't let proxies hold the stream back
  });
  const sendEvent = event => res.write(`data: ${JSON.stringify(event)}\n\n`);

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
    const chat = prepareChat(req, res);
    if (!chat) return;
    const { messages, system, cacheKey, maxTokens, memory } = chat;

    if (chat.greeting) {
      console.log('👋 Generating greeting', chat.greeting);
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

// Update BMO's memory of a friend from recent messages
app.post('/api/remember', async (req, res) => {
  try {
    const { memory, error: memoryError } = validateMemory(req.body.memory);
    if (memoryError) {
      return res.status(400).json({ error: memoryError });
    }

    const { messages } = req.body;
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

    const current = memory || { name: '', pronouns: '', personality: '', notes: [] };
    const transcript = messages
      .map(m => `${m.role === 'user' ? 'Friend' : 'BMO'}: ${m.content}`)
      .join('\n');

    const data = await callClaude({
      system: REMEMBER_PROMPT,
      maxTokens: 700,
      messages: [{
        role: 'user',
        content: `Current memory:\n${JSON.stringify(current)}\n\nNew messages:\n${transcript}`
      }]
    });

    const reply = data.content?.find(block => block.type === 'text')?.text || '';
    const parsed = parseJsonObject(reply);
    if (!parsed) {
      console.error('❌ Memory update returned unparseable text:', reply.slice(0, 200));
      return res.status(502).json({ error: 'BMO could not update its memory this time' });
    }

    const updated = clampMemory(parsed);
    console.log(`🧠 Memory updated (${updated.notes.length} notes${updated.name ? `, name: ${updated.name}` : ''})`);
    res.json({ memory: updated });
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

app.listen(PORT, () => {
  console.log('🎮 BMO Backend Server Started!');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🔑 API Key loaded: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'localhost'}`);
  console.log('');
  console.log('Ready to proxy requests to Anthropic API! 🚀');
});
