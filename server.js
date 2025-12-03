// BMO Backend Server - Proxies requests to Anthropic API
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3001;

// Backend response cache
const responseCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

// Clean expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of responseCache.entries()) {
    if (now > entry.expiresAt) {
      responseCache.delete(key);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`🧹 Cleaned ${removed} expired backend cache entries`);
  }
}, 5 * 60 * 1000);

// Enable CORS for frontend
app.use(cors({
  origin: 'http://localhost:3000'
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'BMO backend is running!' });
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
        max_tokens: 300,  // Reduced from 500 for faster responses
        system: system,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Anthropic API error:', response.status, errorData);
      return res.status(response.status).json(errorData);
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
    
    res.json(data);
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
    
    // Get Fish Audio API key from environment
    const fishApiKey = process.env.FISH_AUDIO_API_KEY;
    
    console.log('🔍 Fish Audio API key check:');
    console.log('   - Key exists:', !!fishApiKey);
    console.log('   - Key length:', fishApiKey?.length || 0);
    console.log('   - Key starts with FAK_:', fishApiKey?.startsWith('FAK_') || false);
    console.log('   - Key preview:', fishApiKey ? fishApiKey.substring(0, 10) + '...' : 'MISSING');
    
    if (!fishApiKey) {
      console.error('❌ Fish Audio API key not found in environment variables');
      console.error('   Make sure .env file has: FISH_AUDIO_API_KEY=your_key_here');
      return res.status(500).json({ 
        error: 'Fish Audio API key not configured on server',
        hint: 'Add FISH_AUDIO_API_KEY to .env file and restart server'
      });
    }

    console.log('🐟 Generating speech with Fish Audio...');
    console.log('📝 Text:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    // BMO voice ID from Fish Audio
    const bmoVoiceId = '323847d4c5394c678e5909c2206725f6';

    console.log('🔗 Trying Fish Audio v1 API endpoint...');

    // Try the v1 endpoint (newer API)
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
        latency: 'normal'
      })
    });

    console.log('📡 Fish Audio response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Fish Audio API error:', response.status, errorData);
      
      // More helpful error messages
      if (response.status === 401) {
        console.error('   → API key is invalid or expired');
        console.error('   → Check your key at: https://fish.audio/app/api-keys/');
      } else if (response.status === 429) {
        console.error('   → Rate limit exceeded or out of credits');
        console.error('   → Check usage at: https://fish.audio/usage');
      }
      
      return res.status(response.status).json(errorData);
    }

    // Get audio as buffer
    const audioBuffer = await response.arrayBuffer();
    console.log('✅ Successfully generated BMO voice!');
    console.log('   Audio size:', (audioBuffer.byteLength / 1024).toFixed(2), 'KB');
    
    // Send audio back to frontend
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('💥 Error in TTS endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.listen(PORT, () => {
  console.log('🎮 BMO Backend Server Started!');
  console.log(`📡 Listening on http://localhost:${PORT}`);
  console.log(`🔑 API Key loaded: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log('');
  console.log('Ready to proxy requests to Anthropic API! 🚀');
});
