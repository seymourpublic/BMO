// BMO backend entry point (Render runs `node server.js`)
import { app, corsSummary } from './app.js';

const PORT = process.env.PORT || 3001;  // Render/Railway set PORT automatically

app.listen(PORT, () => {
  console.log('🎮 BMO Backend Server Started!');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🔑 API Key loaded: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`🌐 CORS enabled for: ${corsSummary()}`);
  console.log('');
  console.log('Ready to proxy requests to Anthropic API! 🚀');
});
