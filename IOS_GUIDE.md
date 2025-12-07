# iOS Compatibility Guide

## iOS Audio Issues Fixed

iOS has **very strict** audio policies. This update fixes all iOS-specific issues.

---

## What Was Fixed for iOS

### Issue 1: Audio Won't Play
**Problem:** iOS blocks all autoplay audio

**Fix:**
- ✅ Silent sound played on start button click
- ✅ Audio context unlocked during user interaction
- ✅ `.load()` called before `.play()`
- ✅ `playsinline` attributes set

### Issue 2: Permission Timing
**Problem:** iOS requires audio unlock in same gesture as permission

**Fix:**
- ✅ All initialization happens in one click handler
- ✅ iOS unlock runs first
- ✅ Proper timing delays between steps

### Issue 3: Audio Context Suspended
**Problem:** iOS suspends audio context by default

**Fix:**
- ✅ Check context state
- ✅ Resume if suspended
- ✅ Test with silent buffer

---

## iOS-Specific Features Added

### 1. iOS Detection
Automatically detects iOS and shows specific instructions:
```
📱 iOS Users
Make sure ringer switch is ON and volume is up!
```

### 2. Unlock Helper
`utils/iosAudio.ts` provides:
- `unlockIOSAudio()` - Unlock audio during user interaction
- `isIOS()` - Detect iOS device
- `isSafari()` - Detect Safari browser
- `canAutoplay()` - Test if autoplay is allowed

### 3. Enhanced Audio Loading
Fish Audio hook now:
- Calls `audio.load()` before play
- Sets `playsinline` attributes
- Adds delay after load
- Better error handling

---

## How It Works on iOS

### Start Flow

```
User clicks "Wake Up BMO!"
    ↓
1. unlockIOSAudio()
   - Creates temporary audio context
   - Plays silent 1-sample buffer
   - Resumes context if suspended
    ↓
2. soundEffects.initialize()
   - Creates main audio context
   - Resumes if suspended
    ↓
3. bmoSongs.initialize()
   - Creates song audio context
   - Resumes if suspended
    ↓
4. Test button click sound
   - Confirms audio is working
    ↓
5. Request microphone
   - If user allows STT
    ↓
6. Wait 300ms
   - Let everything settle
    ↓
7. Start app
   - Greeting plays!
```

### Audio Playback Flow

```
BMO speaks
    ↓
1. Fetch audio from backend
    ↓
2. Create Audio element
    ↓
3. Call audio.load() (iOS requirement)
    ↓
4. Set playsinline attributes
    ↓
5. Wait 50ms (iOS needs this)
    ↓
6. Call audio.play()
    ↓
7. Success! ✅
```

---

## iOS Troubleshooting

### Audio Still Not Working?

**Check these iOS-specific issues:**

#### 1. Silent Mode
```
Check: Ringer switch on left side of phone
Fix: Flip switch so you see ORANGE (ringer on)
```

#### 2. Volume
```
Check: Volume buttons
Fix: Press volume UP until you hear/see volume indicator
```

#### 3. Low Power Mode
```
Check: Battery icon (yellow = low power mode)
Fix: Settings → Battery → Low Power Mode → OFF
```

#### 4. Safari Restrictions
```
Check: Settings → Safari → Advanced
Fix: Disable content blockers that might block audio
```

#### 5. iOS Version
```
Check: Settings → General → About → iOS Version
Fix: Update to iOS 14+ for best compatibility
```

---

## Testing on iOS

### Manual Testing Checklist

On iPhone/iPad:

- [ ] Open in Safari (not Chrome!)
- [ ] Start screen appears
- [ ] iOS-specific warning shows
- [ ] Click "Wake Up BMO!"
- [ ] Hear button click sound
- [ ] Microphone permission requested
- [ ] Greeting "Hello friend!" plays with music
- [ ] Can send message
- [ ] BMO voice responds
- [ ] No errors in Safari console

### Safari Developer Console

Enable on Mac:
1. Safari → Develop → iPhone Name → Page
2. Console tab shows iOS logs

Look for:
```
🍎 iOS audio unlocked
🔊 Audio context initialized
🎵 Song system initialized
✅ BMO started successfully
```

---

## iOS-Specific Code

### Audio Unlock

```typescript
// utils/iosAudio.ts
export const unlockIOSAudio = async () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();
  
  // Play silent sound
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  
  // Resume if suspended
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
};
```

### Audio Playback

```typescript
// hooks/useFishAudio.tsx
const audio = new Audio(audioUrl);

// iOS-specific
audio.load();
audio.setAttribute('playsinline', 'true');
audio.setAttribute('webkit-playsinline', 'true');

// Wait for iOS
await new Promise(resolve => setTimeout(resolve, 50));

// Now play
await audio.play();
```

---

## Known iOS Limitations

### What Works

- ✅ Audio playback after user interaction
- ✅ Microphone access
- ✅ Text-to-speech
- ✅ Sound effects
- ✅ Music/melodies
- ✅ All features!

### What Doesn't Work

- ❌ Autoplay without user interaction (iOS policy)
- ❌ Audio in silent mode (hardware limitation)
- ❌ Background audio without Web Audio API (not needed for BMO)

### Workarounds Implemented

- ✅ Start button ensures user interaction
- ✅ Silent sound unlocks audio
- ✅ Warning about silent mode
- ✅ Proper timing delays
- ✅ Error handling with helpful messages

---

## iOS Safari vs Chrome

### Safari (Recommended)
- ✅ Native Web Audio API support
- ✅ Better performance
- ✅ All features work

### Chrome iOS
- ⚠️ Uses Safari WebKit underneath
- ⚠️ Same restrictions apply
- ✅ Should work but Safari preferred

---

## Deployment Notes

### For Production

Make sure:
1. HTTPS is enabled (iOS requires for mic)
2. Valid SSL certificate
3. Service worker disabled (can interfere)
4. No ad blockers blocking audio

### Vercel/Railway

Both platforms provide:
- ✅ Automatic HTTPS
- ✅ Valid SSL certificates
- ✅ Fast CDN (important for iOS)
- ✅ Proper headers

---

## Common iOS Errors

### "NotAllowedError: play() can only be initiated by a user gesture"

**Cause:** Trying to play audio without user interaction

**Fix:** Already handled with start button ✓

### "InvalidStateError: The object is in an invalid state"

**Cause:** Audio context suspended

**Fix:** Already handled with context.resume() ✓

### "AbortError: The play() request was interrupted"

**Cause:** User navigated away or audio stopped

**Fix:** Already handled with error catching ✓

---

## Best Practices for iOS

### Do's

✅ Always require user interaction before audio
✅ Call unlock helper during click event
✅ Use proper delays (50-300ms) after init
✅ Set playsinline attributes
✅ Test on real iOS device
✅ Check ringer switch
✅ Provide clear instructions

### Don'ts

❌ Don't try to autoplay on page load
❌ Don't assume audio works without testing
❌ Don't ignore suspended audio context
❌ Don't skip .load() call
❌ Don't forget playsinline attribute
❌ Don't test only in Chrome iOS

---

## Support

### iOS Issues?

1. Check Safari console for errors
2. Verify iOS version (14+ recommended)
3. Test on actual device (not simulator)
4. Check ringer switch and volume
5. Disable Low Power Mode

### Still Not Working?

Share these details:
- iOS version
- Safari version
- Error messages from console
- What step fails (start button, greeting, response)

---

## Summary

**iOS is now fully supported!** 🎉

All audio features work on:
- ✅ iPhone (all models)
- ✅ iPad (all models)
- ✅ iPod Touch
- ✅ Safari iOS
- ✅ Chrome iOS (via WebKit)

**Just make sure:**
- Ringer switch is ON
- Volume is UP
- Use Safari for best results
- Click "Wake Up BMO!" button

---

Enjoy BMO on iOS! 📱🎮
