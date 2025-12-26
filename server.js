// BMO Backend Server - Proxies requests to Anthropic API
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;  // Railway sets PORT automatically

// Backend response cache
const responseCache = new Map();
const ttsCache = new Map();  // TTS audio cache
const inFlightRequests = new Map();  // Request deduplication for Claude
const inFlightTTS = new Map();  // Request deduplication for TTS
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const TTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour for TTS (audio doesn't change)
const MAX_TTS_CACHE_SIZE = 50; // Max 50 cached audio files

// Generate cache key from messages
function generateCacheKey(messages) {
  const recentMessages = messages.slice(-3);
  const keyString = recentMessages.map(m => `${m.role}:${m.content}`).join('|');
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
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
    
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
  
  if (removed > 0) {
    console.log(`🧹 Cleaned ${removed} expired cache entries`);
    console.log(`   Response cache: ${responseCache.size}, TTS cache: ${ttsCache.size}`);
  }
}, 5 * 60 * 1000);

// Enable CORS for Vercel frontend
app.use(cors({
  origin: [
    'http://localhost:3000',  // Local development
    'http://localhost:5173',  // Vite dev server alternative port
    process.env.FRONTEND_URL, // Production Vercel URL
    /\.vercel\.app$/          // All Vercel preview deployments
  ].filter(Boolean),          // Remove undefined values
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

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
      // Generate in background (don't await)
      fetch(`http://localhost:${PORT}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: phrase })
      }).catch(() => {});
      preloaded++;
    }
  }
  
  res.json({ 
    message: 'Preloading initiated',
    phrases: commonPhrases.length,
    toPreload: preloaded
  });
});

// Proxy endpoint for Claude API with caching
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    
    // Check backend cache first
    const cacheKey = generateCacheKey(messages);
    const cached = responseCache.get(cacheKey);
    
    if (cached && Date.now() < cached.expiresAt) {
      console.log('⚡ Backend cache hit! Instant response');
      return res.json(cached.data);
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
    
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('❌ API key not found in environment variables');
      return res.status(500).json({ 
        error: 'API key not configured on server' 
      });
    }

    console.log('📤 Forwarding request to Anthropic API...');
    console.log('📝 Messages:', messages.length);

    // Create promise for this request
    const requestPromise = (async () => {
      // Call Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,  // Optimized for faster responses
          temperature: 0.7, // Slightly lower for more focused responses
          system: system,
          messages: messages
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Anthropic API error:', response.status, errorData);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Successfully got response from Anthropic');
      
      // Cache the response
      responseCache.set(cacheKey, {
        data: data,
        expiresAt: Date.now() + CACHE_TTL
      });
      
      // Limit cache size (max 100 entries)
      if (responseCache.size > 100) {
        const firstKey = responseCache.keys().next().value;
        responseCache.delete(firstKey);
        console.log('🧹 Cache full - removed oldest entry');
      }
      
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

// Proxy endpoint for Fish Audio TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Check TTS cache first
    const cacheKey = generateTTSCacheKey(text);
    const cached = ttsCache.get(cacheKey);
    
    if (cached && Date.now() < cached.expiresAt) {
      console.log('💨 TTS Cache HIT:', text.substring(0, 30) + '...');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('X-Cache', 'HIT');
      return res.send(cached.audio);
    }
    
    // REQUEST DEDUPLICATION: Check if same TTS request is in flight
    if (inFlightTTS.has(cacheKey)) {
      console.log('🔄 Duplicate TTS request detected - waiting...');
      try {
        const result = await inFlightTTS.get(cacheKey);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('X-Cache', 'DEDUP');
        return res.send(result);
      } catch (error) {
        console.log('⚠️ In-flight TTS failed, making new request');
      }
    }
    
    console.log('🔄 TTS Cache MISS - generating audio...');
    
    // Get Fish Audio API key from environment
    const fishApiKey = process.env.FISH_AUDIO_API_KEY;
    
    if (!fishApiKey) {
      console.error('❌ Fish Audio API key not configured');
      return res.status(500).json({ 
        error: 'Fish Audio API key not configured on server'
      });
    }

    console.log('🐟 Generating speech with Fish Audio...');
    console.log('📝 Text:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    // BMO voice ID from Fish Audio
    const bmoVoiceId = '323847d4c5394c678e5909c2206725f6';

    // Create promise for this TTS request
    const ttsPromise = (async () => {
      const startTime = Date.now();

      // Call Fish Audio API with optimized settings
      const response = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${fishApiKey}`,
        },
        body: JSON.stringify({
          reference_id: bmoVoiceId,
          text: text,
          format: 'mp3',
          latency: 'balanced',  // OPTIMIZED: balanced instead of normal (faster!)
          streaming: false,      // We'll cache the full audio
          mp3_bitrate: 128       // OPTIMIZED: 128kbps (good quality, smaller size)
        })
      });

      const requestTime = Date.now() - startTime;
      console.log('📡 Fish Audio response:', response.status, `(${requestTime}ms)`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Fish Audio API error:', response.status, errorData);
        throw new Error(`TTS API error: ${response.status}`);
      }

      // Get audio as buffer
      const audioBuffer = await response.arrayBuffer();
      const totalTime = Date.now() - startTime;
      const sizeKB = (audioBuffer.byteLength / 1024).toFixed(2);
      
      console.log('✅ Audio generated successfully!');
      console.log(`   Size: ${sizeKB} KB, Time: ${totalTime}ms`);
      
      // Cache the audio
      const audioBufferNode = Buffer.from(audioBuffer);
      ttsCache.set(cacheKey, {
        audio: audioBufferNode,
        createdAt: Date.now(),
        expiresAt: Date.now() + TTS_CACHE_TTL,
        text: text.substring(0, 50)  // For debugging
      });
      
      console.log(`💾 Cached audio (cache size: ${ttsCache.size}/${MAX_TTS_CACHE_SIZE})`);
      
      return audioBufferNode;
    })();
    
    // Store in-flight TTS request
    inFlightTTS.set(cacheKey, ttsPromise);
    
    try {
      const audioBufferNode = await ttsPromise;
      
      // Send audio back to frontend
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('X-Cache', 'MISS');
      res.send(audioBufferNode);
    } finally {
      // Clean up in-flight request
      inFlightTTS.delete(cacheKey);
    }
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
