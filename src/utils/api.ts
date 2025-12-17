import { Message, BMOResponse } from '../types';
import { BMO_PERSONALITY } from './constants';
import { responseCache } from './cache';

export const sendMessageToClaude = async (
  conversationHistory: Message[]
): Promise<string> => {
  try {
    const startTime = performance.now();
    
    // Check cache first for faster responses
    const cachedResponse = responseCache.get(conversationHistory);
    if (cachedResponse) {
      const cacheTime = performance.now() - startTime;
      console.log(`⚡ Cache hit! Response time: ${cacheTime.toFixed(0)}ms`);
      return cachedResponse;
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
        messages: conversationHistory,
        system: BMO_PERSONALITY
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
    responseCache.set(conversationHistory, assistantResponse);

    return assistantResponse;
  } catch (error) {
    console.error('Error communicating with BMO backend:', error);
    
    // Check if it's a network error (backend not running)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('❌ Cannot connect to backend server! Make sure it\'s running on http://localhost:3001');
    }
    
    throw error;
  }
};
