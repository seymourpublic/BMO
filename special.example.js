// Example "special friend" config. Copy to special.local.js (git-ignored) and make it personal.
// The server uses special.local.js if it exists, otherwise this file.

export default {
  // Who BMO is waiting to meet (matched case-insensitively when they introduce themselves)
  friendName: 'Alex',
  friendPronouns: 'they/them',

  // How BMO refers to the person who made it
  creatorLabel: 'my friend',
  messagesFrom: 'Someone who cares about you',

  // Shared one at a time when the friend seems sad, stressed, lonely or tired
  comfortMessages: [
    "You're doing better than you think.",
    "It's okay to rest."
  ],

  // Songs BMO sings. `melody` names a tune in src/utils/songs.ts ('bright', 'morning', 'special').
  songs: [
    { id: 'bright', melody: 'bright', lyrics: 'Alex, Alex, brighter than a pixel sky!' },
    { id: 'morning', melody: 'morning', lyrics: 'Good morning, Alex, the sun came up to see you!' },
    { id: 'original', melody: 'special', lyrics: 'Alex, do you wanna go on adventures with me?' }
  ]
};
