# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BMO Companion is a full-stack AI chatbot bringing the BMO character from Adventure Time to life with voice interaction, animated expressions, and personality-driven responses.

- **Frontend**: React 18 + TypeScript + Vite (port 3000)
- **Backend**: Node.js + Express (port 3001)
- **AI**: Anthropic Claude API (claude-haiku-4-5 — chosen for speed; benchmarked ~1.8s vs ~3.3s for Sonnet 5.5)
- **Voice**: Fish Audio TTS with BMO voice clone (reference_id: `323847d4c5394c678e5909c2206725f6`)
- **Deployment**: Vercel (frontend) + Railway (backend)

## Commands

```bash
# Development - run both frontend and backend concurrently
npm start

# Frontend only (Vite dev server with HMR)
npm run dev

# Backend only (Express server)
npm run server

# Backend with auto-reload
npm run server:dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Create `.env` in root (never commit):
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxx
FISH_AUDIO_API_KEY=FAK_xxx
FRONTEND_URL=https://your-app.vercel.app  # For CORS in production
VERCEL_PROJECT_PREFIX=bmo-  # Optional: allow this project's Vercel preview URLs (https://bmo-*.vercel.app)
PORT=3001  # Railway sets automatically
```

Frontend (Vercel) uses `VITE_BACKEND_URL` (defaults to `http://localhost:3001`). No API keys ever go in `VITE_*` vars.

## Architecture

### Request Flow

```
User Input → Frontend Cache (Memory/IndexedDB) → Backend Cache → Anthropic API
                     ↓
              Extract emotes (*excited*, *giggles*)
                     ↓
              TTS via /api/tts → Fish Audio (cached 1hr)
                     ↓
              Update mood → BMOFace SVG expression
```

### Backend API Endpoints (server.js)

- `POST /api/chat` - Proxies to Anthropic Claude API with 30-min response cache. Takes `messages` plus optional `memory` (validated, appended to the system prompt) or a `greeting` of numbers only (server writes the instruction; not cached). The system prompt is server-owned (`personality.js`). Validates max 20 messages, roles `user`/`assistant`, max 2,000 chars each. Rate-limited to 20 req/min per IP (in-memory).
- `POST /api/chat/stream` - Same checks as `/api/chat`, but streams the reply as Server-Sent Events (`{type:'text'|'done'|'error'}`) so the app can show and speak the first sentence right away. This is what the app uses. Cached replies are sent as one `text` event.
- `POST /api/remember` - Updates BMO's memory of the friend from recent messages (Haiku returns JSON `{name, pronouns, personality, notes}`, clamped server-side). Same rate limit as chat.
- `POST /api/tts` - Proxies to Fish Audio with 1-hour audio cache (max 50 files). Intentionally NOT length- or rate-limited (owner's decision).
- `GET /health` - Health check with cache statistics
- `POST /api/preload` - Preload common TTS phrases

### Streaming voice

Replies stream in (`streamChat` in `src/utils/api.ts`), the caption types out live, `src/utils/sentenceSplitter.ts` pulls out *emotes* and complete sentences, and `useFishAudio`'s speech queue (`startQueue`/`enqueue`/`endQueue`) voices up to 2 sentences ahead and plays them back to back on one audio element (iOS-safe). Each reply has an id; a new message or `interrupt()` cancels the old reply's download, caption and voice. A watchdog moves on if a clip never reports ending. Measured: ~2 s from send to first spoken word on a long story (was 9–14 s). Spec: `docs/superpowers/specs/2026-09-30-streaming-voice-design.md`.

The backend uses the official `@anthropic-ai/sdk` (built-in retries).

### Interface

"BMO is the app": one show-accurate BMO fills the screen. BMO starts asleep; the big red button wakes it, then is tap-to-talk (Space on desktop). Replies show as a caption on BMO's screen while the mouth flaps in time with the voice. Three icons below BMO open Type, Messages (full history) and Settings (theme, voice on/off). Design spec: `docs/superpowers/specs/2026-09-29-look-and-interface-design.md`.

### Memory (on-device only)

`src/utils/memory.ts` stores profile (name, pronouns, personality), notes, last 200 messages and stats in `localStorage` (`bmo-memory-v1`). `useMemory` calls `/api/remember` every 6 messages and when the page is hidden. Fields the user edits in Settings → About you win over what BMO learns. Pronouns are only recorded when the friend states them. Safari clears site data after 7 days unvisited unless added to the home screen. Spec: `docs/superpowers/specs/2026-09-30-personality-memory-behaviours-design.md`.

### Behaviours

Green = story, triangle = Rock Paper Scissors (D-pad picks, red quits), D-pad = look around (4 quick presses = dance), idle actions after 20 s and dozing after 3 min (`useIdle`), escalating poke reactions (`usePokes`), personal greeting on wake.

### Key Frontend Files

- `src/App.tsx` - Composition only: wake flow, red-button/keyboard handling, caption, panels
- `src/hooks/useBMOConversation.ts` - Conversation logic: `send()`, history, mood, caption, `sing()`, special-song easter egg
- `src/components/BMOBody.tsx` - BMO's body (screen, disc slot, D-pad, triangle, small green + big red buttons, ports, limbs)
- `src/components/BMOFace.tsx` - Show-style faces per mood + asleep/listening; mouth flaps (talking: smile/"D" shapes, singing: round "O" with tongue) driven by `getMouthLevel()` with a timer fallback
- `src/components/{TypeBar,HistoryPanel,SettingsPanel,Sheet,ErrorBoundary}.tsx` - Panels and crash screen
- `src/hooks/useFishAudio.tsx` - TTS via backend. `speak()` resolves when playback ends and rejects if audio fails (`PLAYBACK_BLOCKED` = browser needs a tap). `getMouthLevel()` reads loudness from a Web Audio analyser (-1 if unavailable); `getProgress()` drives caption scrolling
- `src/hooks/useSpeechRecognition.tsx` - Web Speech API; auto-stops on a pause; `cancelListening()` discards
- `src/utils/sentenceSplitter.ts` - Streamed text → speakable sentences + emotes
- `src/utils/emotes.ts` - `extractEmotes`, `emoteToMood`
- `src/utils/themes.ts` - `COLOR_THEMES` (body, bodyShade, outline, screen, face), persisted in localStorage
- `src/utils/persistentCache.ts` - Dual-layer cache (memory + IndexedDB)
- `src/utils/sounds.ts` / `songs.ts` - Retro sound effects and melodies (Web Audio API)
- `src/hooks/useMemory.ts`, `src/utils/memory.ts` - On-device memory
- `src/hooks/useIdle.ts`, `src/hooks/usePokes.ts` - Idle life and poke reactions
- `src/components/RockPaperScissors.tsx` - Game logic + screen
- `src/components/AboutYouPanel.tsx` - Profile/notes editor in Settings
- `src/utils/constants.ts` - Story prompts
- `personality.js` (root) - BMO personality system prompt, used by server.js

### Caching Strategy

Four cache layers for performance:
1. **Frontend Memory** - Instant (~5ms), session-only
2. **Frontend IndexedDB** - Fast (~10-50ms), persistent across sessions
3. **Backend Response Cache** - 30-min TTL, max 100 entries
4. **Backend TTS Cache** - 60-min TTL, max 50 audio files

Request deduplication prevents duplicate API calls for in-flight requests.

### Emote System

BMO responses include `*action*` markers parsed by regex:
```javascript
const emoteRegex = /\*([^*]+)\*/g;
```
Emotes map to moods via `src/utils/emotes.ts`: `*excited*` → 'excited' mood → face expression + sound effect

### Color Themes

7 themes in `src/utils/themes.ts` (BMO/original teal, Blue, Pink, Red, White, Purple, Black). Themes change body/screen/face colours; the front buttons keep the show's colours.

## iOS Considerations

`src/utils/iosAudio.ts` handles:
- Silent-buffer audio unlock (called from the wake tap)

`useFishAudio.prewarmAudio()` must also run inside a tap: it creates pooled audio elements and the mouth-flap AudioContext.

## Notes

- No testing framework configured
- CORS whitelist in server.js: localhost, `FRONTEND_URL`, and `VERCEL_PROJECT_PREFIX` previews only
- Never commit — the owner commits changes themselves
- Conversation history trimmed to last 6 messages before API calls
- Max tokens set to 300 for faster responses
