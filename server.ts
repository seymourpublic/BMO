// BMO Backend Server - Proxies requests to Anthropic API
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3001;

// Enable CORS for frontend
app.use(cors({
  origin: 'http://localhost:3000'
}));

// Parse JSON bodies
app.use(express.json());

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  system: string;
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'BMO backend is running!' });
});

// Proxy endpoint for Claude API
app.post('/api/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { messages, system } = req.body;
    
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
        max_tokens: 500,
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
    
    res.json(data);
  } catch (error) {
    console.error('💥 Error in chat endpoint:', error);
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
