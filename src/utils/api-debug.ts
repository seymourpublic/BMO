import { Message, BMOResponse } from '../types';
import { BMO_PERSONALITY } from './constants';

export const sendMessageToClaude = async (
  conversationHistory: Message[]
): Promise<string> => {
  try {
    // DEBUG: Log that we're starting
    console.log('🔍 Starting API call...');
    
    // Get API key from environment variables
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    
    // DEBUG: Check if API key exists (but don't log the actual key!)
    console.log('🔑 API Key loaded:', !!apiKey);
    console.log('🔑 API Key length:', apiKey?.length || 0);
    console.log('🔑 API Key starts with sk-ant:', apiKey?.startsWith('sk-ant-') || false);
    
    if (!apiKey) {
      const errorMsg = '❌ API key not found! Please set VITE_ANTHROPIC_API_KEY in your .env file';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!apiKey.startsWith('sk-ant-')) {
      const errorMsg = '❌ API key format looks wrong! It should start with "sk-ant-"';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // DEBUG: Log request details
    console.log('📤 Sending request to Anthropic API...');
    console.log('📝 Conversation history length:', conversationHistory.length);
    console.log('📝 Last message:', conversationHistory[conversationHistory.length - 1]);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: BMO_PERSONALITY,
        messages: conversationHistory
      })
    });

    // DEBUG: Log response status
    console.log('📥 Response status:', response.status, response.statusText);

    if (!response.ok) {
      // Try to get error details
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: 'Could not parse error response' };
      }
      
      console.error('❌ API Error Response:', errorData);
      
      // Provide helpful error messages based on status code
      if (response.status === 401) {
        throw new Error('❌ API Key is invalid! Check your .env file and make sure the key is correct.');
      } else if (response.status === 429) {
        throw new Error('⚠️ Rate limit exceeded or out of credits! Check your Anthropic account.');
      } else {
        throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
    }

    const data: BMOResponse = await response.json();
    
    // DEBUG: Log successful response
    console.log('✅ API call successful!');
    console.log('📝 Response length:', data.content[0].text.length);
    
    return data.content[0].text;
  } catch (error) {
    console.error('💥 Error in sendMessageToClaude:', error);
    
    // Make the error message more user-friendly
    if (error instanceof Error) {
      throw error; // Re-throw with our nice message
    } else {
      throw new Error('Unknown error occurred while calling Claude API');
    }
  }
};
