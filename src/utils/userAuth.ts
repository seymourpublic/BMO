// User Authentication System
// Simple localStorage-based auth for BMO

export interface User {
  id: string;
  name: string;
  createdAt: string;
  lastSeen: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface UserData {
  user: User;
  conversations: ConversationMessage[];
  preferences: {
    voiceEnabled: boolean;
    autoSpeak: boolean;
  };
}

// Get current user
export const getCurrentUser = (): User | null => {
  const userJson = localStorage.getItem('bmo_current_user');
  if (!userJson) return null;
  return JSON.parse(userJson);
};

// Set current user
export const setCurrentUser = (user: User): void => {
  localStorage.setItem('bmo_current_user', JSON.stringify(user));
};

// Create new user
export const createUser = (name: string): User => {
  const user: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };
  
  // Save user
  setCurrentUser(user);
  
  // Initialize user data
  const userData: UserData = {
    user,
    conversations: [],
    preferences: {
      voiceEnabled: true,
      autoSpeak: true
    }
  };
  
  saveUserData(userData);
  return user;
};

// Load user data
export const loadUserData = (userId: string): UserData | null => {
  const dataJson = localStorage.getItem(`bmo_user_data_${userId}`);
  if (!dataJson) return null;
  return JSON.parse(dataJson);
};

// Save user data
export const saveUserData = (userData: UserData): void => {
  // Update last seen
  userData.user.lastSeen = new Date().toISOString();
  
  // Save to localStorage
  localStorage.setItem(`bmo_user_data_${userData.user.id}`, JSON.stringify(userData));
  
  // Update current user
  setCurrentUser(userData.user);
};

// Add message to conversation history
export const addMessageToHistory = (
  userId: string,
  role: 'user' | 'assistant',
  content: string
): void => {
  const userData = loadUserData(userId);
  if (!userData) return;
  
  const message: ConversationMessage = {
    role,
    content,
    timestamp: new Date().toISOString()
  };
  
  userData.conversations.push(message);
  
  // Keep only last 50 messages to avoid localStorage limits
  if (userData.conversations.length > 50) {
    userData.conversations = userData.conversations.slice(-50);
  }
  
  saveUserData(userData);
};

// Get conversation history
export const getConversationHistory = (userId: string): ConversationMessage[] => {
  const userData = loadUserData(userId);
  return userData?.conversations || [];
};

// Get conversation context for API (last 10 messages)
export const getConversationContext = (userId: string): ConversationMessage[] => {
  const history = getConversationHistory(userId);
  return history.slice(-10); // Last 10 messages for context
};

// Clear conversation history
export const clearConversationHistory = (userId: string): void => {
  const userData = loadUserData(userId);
  if (!userData) return;
  
  userData.conversations = [];
  saveUserData(userData);
};

// Logout
export const logout = (): void => {
  localStorage.removeItem('bmo_current_user');
};

// Get user summary for BMO personality
export const getUserSummary = (userId: string): string => {
  const userData = loadUserData(userId);
  if (!userData) return '';
  
  const user = userData.user;
  const messageCount = userData.conversations.length;
  const userMessages = userData.conversations.filter(m => m.role === 'user');
  
  return `You are talking to ${user.name}. You have had ${messageCount} messages in this conversation (${userMessages.length} from ${user.name}). Remember their name and reference past topics naturally.`;
};
