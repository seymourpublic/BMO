// Example "special friend" config. Copy to special.local.js (git-ignored) and make it personal.
// The server uses special.local.js if it exists, otherwise this file.

export default {
  // Who BMO is waiting to meet (matched case-insensitively when they introduce themselves)
  friendName: 'Alex',
  friendPronouns: 'they/them',

  // How BMO refers to the person who made it
  creatorLabel: 'my friend',
  messagesFrom: 'Someone who cares about you',

  // Things about the friend that BMO knows and is curious about
  friendFacts: [
    'Alex studies music.'
  ],

  // Shared one at a time when the friend seems sad, stressed, lonely or tired
  comfortMessages: [
    "You're doing better than you think.",
    "It's okay to rest."
  ],

  // Special days (month 1-12, optional day). A day-less occasion lasts the whole month.
  // kind: 'birthday' (balloons) or 'met' (hearts)
  occasions: [
    { id: 'birthday', kind: 'birthday', month: 1, day: 1, message: 'Happy birthday, Alex!' },
    { id: 'met', kind: 'met', month: 2, message: 'This is the month you two met!' }
  ],

  // Songs BMO sings. `melody` names a tune in src/utils/songs.ts ('bright', 'morning', 'special').
  songs: [
    { id: 'bright', melody: 'bright', lyrics: 'Alex, Alex, brighter than a pixel sky!' },
    { id: 'morning', melody: 'morning', lyrics: 'Good morning, Alex, the sun came up to see you!' },
    { id: 'original', melody: 'special', lyrics: 'Alex, do you wanna go on adventures with me?' }
  ]
};
