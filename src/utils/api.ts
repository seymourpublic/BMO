import { Message, BMOResponse } from '../types';
import { BMO_PERSONALITY } from './constants';
import { responseCache } from './cache';
import { getUserSummary } from './userAuth';

// Request deduplication map
const pendingRequests = new Map<string, Promise<string>>();

// Preloaded common phrases cache
const preloadedPhrases = new Set<string>();

export const sendMessageToClaude = async (
  conversationHistory: Message[],
  userId?: string
): Promise<string> => {
  try {
    const startTime = performance.now();
    
    // OPTIMIZATION 1: Trim to last 4 messages (2 exchanges) instead of 6
    // This reduces token usage and improves response time
    const trimmedHistory = conversationHistory.slice(-4);
    
    // Check cache first for faster responses
    const cachedResponse = responseCache.get(trimmedHistory);
    if (cachedResponse) {
      const cacheTime = performance.now() - startTime;
      console.log(`⚡ Cache hit! Response time: ${cacheTime.toFixed(0)}ms`);
      return cachedResponse;
    }

    // OPTIMIZATION 2: Request deduplication - prevent duplicate in-flight requests
    const requestKey = JSON.stringify(trimmedHistory.map(m => m.content).join('|'));
    if (pendingRequests.has(requestKey)) {
      console.log('⏳ Deduplicating request - using existing promise');
      return pendingRequests.get(requestKey)!;
    }

    // Create the request promise
    const requestPromise = (async () => {
      try {
        // Build system prompt with user context
        let systemPrompt = BMO_PERSONALITY;
        if (userId) {
          const userContext = getUserSummary(userId);
          if (userContext) {
            systemPrompt = `${BMO_PERSONALITY}\n\n${userContext}`;
          }
        }

        // Call our backend proxy instead of Anthropic directly
        // This avoids CORS issues
        // Backend URL from environment variable (Vercel) or localhost (dev)
        const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const API_URL = `${API_BASE_URL}/api/chat`;
        
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: trimmedHistory,  // Send trimmed history
            system: systemPrompt
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Provide helpful error messages
          if (response.status === 401) {
            throw new Error('❌ API Key is invalid! Check your backend .env file.');
          } else if (response.status === 429) {
            throw new Error('⚠️ Rate limit exceeded or out of credits! Check your Anthropic account.');
          } else if (response.status === 500) {
            throw new Error('❌ Backend server error. Make sure the server is running!');
          } else {
            throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
          }
        }

        const data: BMOResponse = await response.json();
        const assistantResponse = data.content[0].text;

        const totalTime = performance.now() - startTime;
        console.log(`📊 Total response time: ${totalTime.toFixed(0)}ms`);

        // Cache the response for faster future access
        responseCache.set(trimmedHistory, assistantResponse);

        return assistantResponse;
      } finally {
        // Clean up pending request
        pendingRequests.delete(requestKey);
      }
    })();

    // Store pending request
    pendingRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  } catch (error) {
    console.error('Error communicating with BMO backend:', error);
    
    // Check if it's a network error (backend not running)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('❌ Cannot connect to backend server! Make sure it\'s running on http://localhost:3001');
    }
    
    throw error;
  }
};

// OPTIMIZATION 3: Preload common TTS phrases in background
export const preloadCommonPhrases = async () => {
  const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const API_URL = `${API_BASE_URL}/api/tts`;
  
  const commonPhrases = [
    "Hello friend!",
    "Oh boy!",
    "BMO is happy!",
    "Tell me more!",
    "That's so cool!",
    "BMO loves you!"
  ];

  console.log('🔄 Preloading common TTS phrases...');
  
  for (const phrase of commonPhrases) {
    if (preloadedPhrases.has(phrase)) continue;
    
    try {
      // Fetch and cache in background (fire and forget)
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: phrase })
      }).then(response => {
        if (response.ok) {
          preloadedPhrases.add(phrase);
          console.log(`✅ Preloaded: "${phrase}"`);
        }
      }).catch(() => {
        // Silently fail - preloading is optional
      });
      
      // Small delay between preloads to avoid overwhelming server
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      // Ignore preload errors
      console.log(`⚠️ Failed to preload: "${phrase}"`);
    }
  }
};