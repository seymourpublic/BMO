# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BMO Companion is a full-stack AI chatbot bringing the BMO character from Adventure Time to life with voice interaction, animated expressions, and personality-driven responses.

- **Frontend**: React 18 + TypeScript + Vite (port 3000)
- **Backend**: Node.js + Express (port 3001)
- **AI**: Anthropic Claude API (claude-haiku-4-5 — chosen for speed; benchmarked ~1.8s vs ~3.3s for Sonnet 5.5)
- **Voice**: Fish Audio TTS with BMO voice clone (reference_id: `323847d4c5394c678e5909c2206725f6`)
- **Deployment**: Vercel (frontend) + Render (backend; set `FRONTEND_URL`, `ANTHROPIC_API_KEY`, `FISH_AUDIO_API_KEY`, `BMO_SPECIAL_JSON` there)

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

# Run the automated tests (Vitest; no real API calls)
npm test
```

## Environment Variables

Create `.env` in root (never commit):
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxx
FISH_AUDIO_API_KEY=FAK_xxx
FRONTEND_URL=https://your-app.vercel.app  # For CORS in production. No trailing slash needed; comma-separate several
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

### Backend

`app.js` builds the Express app (tests import it); `server.js` just starts it (`node server.js` on Render).

### Backend API Endpoints (app.js)

- `POST /api/chat` - Proxies to Anthropic Claude API with 30-min response cache. Takes `messages` plus optional `memory` (validated, appended to the system prompt) or a `greeting` of numbers only (server writes the instruction; not cached). The system prompt is server-owned (`personality.js`). Validates max 20 messages, roles `user`/`assistant`, max 2,000 chars each. Rate-limited to 20 req/min per IP (in-memory).
- `POST /api/chat/stream` - Same checks as `/api/chat`, but streams the reply as Server-Sent Events (`{type:'text'|'done'|'error'}`) so the app can show and speak the first sentence right away. This is what the app uses. Cached replies are sent as one `text` event. May also carry one shrunk photo: `image` (JPEG/PNG data URL, max 300 KB decoded), `imageKind` (`snapshot` | `memory`) and an optional `caption` (max 200 chars); photo requests are never cached or logged, and only this route accepts bodies up to 1 MB (256 KB elsewhere).
- `POST /api/remember` - Updates BMO's memory of the friend from recent messages (Haiku returns JSON `{name, pronouns, personality, notes}`, clamped server-side). Same rate limit as chat.
- `POST /api/tts` - Proxies to Fish Audio with 1-hour audio cache (max 50 files). Intentionally NOT length- or rate-limited (owner's decision).
- `GET /health` - Health check with cache statistics
- `POST /api/preload` - Preload common TTS phrases

### Conversation

- **Conversation mode** (💬 "Talk mode" in the menu, remembered per device): red starts a back-and-forth; BMO listens again after every reply. Silence for one turn, "bye BMO" / "stop listening", or red ends it (`App.tsx`, conversation effects).
- **Talking over BMO**: during a reply the mic stays on (not on iOS); real words stop BMO mid-sentence, BMO's own voice is ignored via `isEcho` (`src/utils/conversation.ts`). On iOS, tapping the screen interrupts.
- **BMO speaks first**: an idle action may become a nudge (`canNudge`: 60 s quiet, 5 min apart, max 2 unanswered, 50%). Chats accept `nudge: true`.
- **Date & weather**: the client sends `now` (local date/time text); the server adds rough local weather from the request IP (`weather.js`: ipwho.is → GeoJS fallback → Open-Meteo, cached 30 min, failures 2 min; `/health` warms it).

### BMO comes alive

- **Faces:** 12 moods incl. `love` (heart eyes), `crying` (dripping tears), `sleepy`, `starry`, `blushing`, `pouty`; emotes map to them in `src/utils/emotes.ts`.
- **Body:** `poseFor()` (`src/utils/pose.ts`) picks dance > wave > sleep > surprise > droop > talk > bounce > sway; `BMOBody` applies `bmo-pose-*` CSS to arms/legs/body (App.css).
- **Steven Universe:** BMO's favourite show (personality block; never sings lyrics).
- **Friend facts:** `friendFacts` in the private config (e.g. she studies finance). Finance gets child-level curiosity and never real investment advice (`buildFactsBlock` in personality.js).
- **Special days:** `occasions` in the private config (birthday 17 Sep; "the month we met" = all of October). `POST /api/special/today` answers for the special friend only and never returns dates; decorations via `EffectOverlays`; message once a year (`occasionsSeen`).

### Growing BMO

BMO feels like it's learning (spec: `docs/superpowers/specs/2026-10-01-growing-bmo-design.md`).

**How BMO learns:** `/api/remember` (every 6 messages / on leave) also takes `today` and returns `growth`:
- **`followUps`:** `{about, askAfter}`. The server keeps dates between today and +60 days.
- **`words`:** her phrases and slang.
- **`diary`:** one line.

`mergeGrowth` in `src/utils/memory.ts` stores them on the device:
- follow-ups: max 10, expire 14 days after the ask date
- words: max 15
- diary: 3 lines a day, 60 days

**What goes into chats:**
- Chats send the words and the last 3 diary lines. The diary is private and is never shown or read out.
- A due follow-up goes only with a greeting or nudge (`followUp`) and is removed once sent.

**Features BMO grows (`src/utils/growth.ts` `FEATURES`):** when a feature ships, add an entry with a `dream` and a `firstUse` line.
- **Dream:** one per wake after the greeting, skipped if a special moment already happened.
- **First use:** the gasp the first time it's used (`firstUse(id)` in `useMemory`).
- **New devices** (`visits` 0) start with every feature dreamed.

**Milestones (`MILESTONES`):**
- chats 50/100/250/500/1000, days 7/30/100/365 from `firstVisit`, first photo, first memory
- one per visit: fireworks + an AI line via the chat context `milestone` (server whitelist), with `MILESTONE_FALLBACK` if that fails
- songs at 100 and 365 days

**Games:**
- **Rock Paper Scissors:** `pickBmoHand` predicts from her last 30 throws. The smart chance is 0 for the first 5 games, then 10% rising by 1% per game, capped at 45%.
- **Hidden game:** BMO mentions her best score.

### Kitchen companion (7b-1)

Spec: `docs/superpowers/specs/2026-10-01-companions-design.md`.

**Starting:** voice/typed only, via `detectPhrase`:
- `cook`: "let's cook", "what can I make", "kitchen mode"
- `recipeBook`
- `shoppingList`

**Getting a recipe:** `POST /api/recipe` takes `{image?}` or `{request?}` (≤300 chars) and returns `{recipe}` or `{unreadable:true}`.
- Built by `RECIPE_PROMPT` in personality.js and cleaned by `sanitizeRecipe` in app.js.
- A photographed recipe is copied faithfully; a dish name or fridge list gets "BMO's version".
- Food safety is required for recipes BMO writes.

**On the device:**
- **Session:** `useKitchen` reducer: choose → loading → shopping → cooking → photo → rating → tweak. Saved in `bmo-kitchen-v1` and resumed on wake.
- **Logic:** `useKitchenCompanion` turns speech and taps into steps (`kitchenCommands.ts`: next/back/repeat/ingredients/steps left/done/stop).
- **Questions:** anything else goes to chat with `mode:'kitchen'` + `kitchen` context (`buildKitchenBlock`).
- **Screen:** `KitchenScreen` is a layer over BMO's screen, because the screen itself is a button and buttons can't nest. It shows a chef hat, the ingredient checklist, the step with Back/Next, a speech bubble for BMO's answers, and hearts.

**Listening:** hands-free in the kitchen, but only while BMO is quiet (kitchen speakers cause echo).

**Photos:**
- **Recipe photos:** the back camera with a shutter button (`CameraView` `facing`/`shutter`/`reading`). The readable copy is 1280 px; `encodeUnder` steps quality down to ≤280 KB.
- **Dish photos:** the chat `imageKind: 'dish'`.

**Storage:**
- **Recipe book:** `recipeBook.ts`, IndexedDB `BMOPhotosDB` v2 store `recipes` (max 100). `localDb.ts` steps aside on `versionchange` and retries a blocked open.
- **Shopping list:** `shoppingList.ts` (`bmo-shopping-v1`, max 60).
- **When a dish is finished:** `stats.dishes`, the `first-dish` milestone, and a follow-up for the next day.

### Crisis mode

Spec: `docs/superpowers/specs/2026-10-03-crisis-mode-design.md`. Logic lives in `crisis.js` (backend) and `src/utils/crisis.ts` (app).

**Levels:** 0 normal · 1 low · 2 heavy day · 3 hurting · 4 struggling · 5 at risk · 6 in danger, plus 18 kinds of feeling (`KINDS`).

**On the server (`assessCrisis` in app.js):**
- **Every normal chat:** a fast phrase screen (`screenForCrisis`); flagged messages, or ones sent while already at level ≥2, get the careful check (Haiku, `CRISIS_CHECK_PROMPT` → `sanitizeCrisisCheck`).
- **Moving between levels** (`nextCrisisState`): up immediately, down one step after 3 calm turns; after level 5+, BMO stays at least at 4 for the visit.
- **What BMO is told:** `buildCrisisBlock` goes last in the system prompt. The stream sends `{type:'crisis', level, kind, calmStreak, floor}` before the reply.
- **Safety net:** for the special friend, unflagged messages still get a careful check in the background, so the alert can't be missed by the phrase list.
- **Always on:** a "Keeping the friend safe" section in `BMO_PERSONALITY` (no guilt-tripping, no special messages in danger, real people only, never show characters).

**The alert** (level 6, special friend only):
- **When:** `shouldAlert` (confidence ≥ 0.7; never to a named source of harm, via `special.alert.ownerNames`).
- **What you get:** `buildAlertMessage` = "check on her + category", never her words.
- **Sending:** `createOwnerNotifier` (at most one per 4 h). **No channel yet** (`send: null` → the log says "alert not sent: no alert channel configured yet"). BMO only tells her "BMO is going to let someone who loves you know" when an alert really went out.

**In the app (state in `bmo-crisis-v1`, restored for 2 h):**
- **From level 2:** no nudges, idle songs/whispers, milestones or surprises.
- **From level 4 (supportive):** games, modes and pokes are off (gentle lines instead), the kitchen keeps its place, there's no dozing, and talk mode never times out ("BMO is still right here").
- **Face:** bright faces soften to the new `calm` mood from level 3.
- **Breathing:** "breathe with BMO" makes the face grow and shrink with captions, 6 × 8 s; red stops it.
- **Check-ins:** a yes to "Can BMO check on you tomorrow?" adds a gentle follow-up.
- **Private messages:** messages from level 3+ are marked `sensitive` and never sent to `/api/remember`, whose prompt also refuses crisis content.
- **Calm wake:** the day after level 5+, the wake is calm (`calmWake`).

**Not built (owner deciding):** the "Get help now" card, help-line numbers by voice, and the alert channel.

### Fashion show (7c)

Spec: `docs/superpowers/specs/2026-10-02-fashion-show-design.md`. Starts by phrase:
- `fashionShow`: "fashion show", "runway"
- `outfitCheck`: "how do I look", "outfit check"
- `wardrobe`: "BMO's wardrobe", "dress up BMO"

**How it runs:** `useFashionCompanion` (mode `fashion`) with `FashionScreen` on BMO's screen (stage lights, camera, polaroid, speech bubble).
- **Runway:** a 5 s selfie countdown per look; "that's all" or 6 looks → finale.
- **Outfit check:** 3 s countdown and a kind optional tip, then the mode ends.

**Server:**
- `POST /api/fashion` takes `{image, style}` and returns `{award, comment, tip?, accessory, colour}` (`buildFashionPrompt`: clothes/colours/styling/confidence only, never body/face/weight; `sanitizeFashion` clamps and strips *emotes*).
- `POST /api/fashion/finale` takes the award titles and returns `{winner, line}`. Photos are never re-sent.

**Accessories:** 8 items (`fashion.ts` `ACCESSORIES`) drawn by `BMOAccessory.tsx` inside BMO's pose layer.
- top: bow, topHat, flowerCrown, tiara
- under the screen: bowTie, scarf
- behind: cape
- sunglasses are drawn in `BMOFace`, so they follow its eyes

**Which outfit shows:** the show look (`showOutfit`) wins until the next wake; otherwise the friend's wardrobe choice (`bmo-outfit-v1`) is worn.

**Saving looks:** they follow "Photos BMO takes" and are saved as photo kind `look` (album tab "Our looks").

### Study companion (7b-2)

All three study modes run in `useStudyCompanion`, with screens in `StudyScreens.tsx`. They start by voice or typed phrase only:
- `study`: "study time", "focus mode"
- `quiz`: "quiz me"
- `hardOnes`: "quiz my hard ones"
- `studyCards`
- `teach`: "let me teach you about…"

**Focus timer (mode `study`):**
- **Rounds:** 25/5 by default, with a 15-minute break after 4 rounds. "N minutes" sets the length (`parseMinutes`).
- **Timing:** based on real clock times, and the screen is kept on with Wake Lock.
- **During focus:** BMO is quiet; a tap gets a 4-second whisper with the time left. Red listens once for "how long left", "pause", "keep going" or "stop studying".
- **Saved:** `focusMinutes` in `bmo-study-v1`.

**Quiz (mode `quiz`):**
- **Making it:** a notes photo or screenshot (readable copy, `shrinkPageForReading`) goes to `POST /api/quiz` and comes back as 5–8 questions from the notes only (`QUIZ_PROMPT`, `sanitizeQuiz`), or as unreadable.
- **Judging:** `POST /api/quiz/check` returns `{verdict: right|partly|notYet, reply}` (`QUIZ_CHECK_PROMPT`). If it fails, she marks the answer herself with ✓/✗.
- **On the device:** "I don't know" and "skip" are handled locally, and verdicts are recorded as soon as she answers.
- **Listening:** hands-free while BMO is quiet.

**Study cards (`studyCards.ts`, max 200):**
- **Spacing:** a miss goes to box 1, due tomorrow. Right answers move it up a box, due in 2/4/7/14 days; mastered after box 5.
- **Offer on wake:** when ≥3 are due.

**Teach BMO (mode `teach`):** a chat mode block where BMO is a curious student and never gives financial advice. Companions pass her words on with `send(text, true)`, plain talk with no phrases, so "teach you about…" can't restart teach mode in a loop.

### BMO is camera

- **Triggers:** "BMO, take a picture" / "selfie" / "BMO is camera" (`detectPhrase` → `camera`), the small blue dot, or 📷 Photos → "Take a photo".
- **Camera** (`src/components/CameraView.tsx`): front camera fills BMO's screen (mirrored), 3-2-1 beeps, flash + shutter, camera off immediately. The photo shows on BMO's screen while BMO comments (`lookAtPhoto` in `useBMOConversation`; only a text note goes into the history).
- **Shrinking** (`src/utils/images.ts`): everything is shrunk on the device. Album copy max 1600 px (JPEG 0.85), AI copy max 768 px (JPEG 0.8); gallery picks up to 25 MB. A 7 MB phone photo became 203 KB.
- **Album** (`src/utils/photoAlbum.ts`, IndexedDB `BMOPhotosDB`, max 60, oldest removed): tabs "BMO's photos" / "Our memories" in `AlbumPanel`. Memories are added by the friend with an optional caption and always kept; idle BMO sometimes shows one (1 in 6 idle actions). Photos are saved as soon as BMO's comment arrives.
- **Settings → Photos BMO takes** (`bmo-photo-setting`): `album` (default) / `comment` (nothing saved) / `download` (album + "Save to phone"). Forget everything also clears the album.
- Spec: `docs/superpowers/specs/2026-10-01-bmo-is-camera-design.md`.

### Special friend & easter eggs

BMO was made for someone special. Her details live in `special.local.js` (git-ignored; `special.example.js` shows the shape) or, in production, the `BMO_SPECIAL_JSON` env var on Railway. Nothing personal is in the frontend bundle: when someone introduces themselves, the client asks `POST /api/special/recognise`; on a match, memory gets `special: true` and chats send `special: true` so the server adds the special-friend prompt (comfort messages, songs via `POST /api/special/song`). Chats also accept `mode` (`detective` | `football`) and `hour` (bedtime BMO).

Easter eggs (`src/utils/easterEggs.ts`, wired in `App.tsx`): "click it click it" / "clock it", BMO Chop, Detective BMO Noire, Football in the mirror (phrase or long-press the screen), hidden button (long-press the D-pad centre → `HiddenGame`), Konami code (↑↑↓↓←→←→ green red → Rainbow theme), stranger alarm, battery low (10 pokes), bedtime + bath-time joke. Spec: `docs/superpowers/specs/2026-09-30-erica-and-easter-eggs-design.md`.

### Streaming voice

Replies stream in (`streamChat` in `src/utils/api.ts`), the caption types out live, `src/utils/sentenceSplitter.ts` pulls out *emotes* and complete sentences, and `useFishAudio`'s speech queue (`startQueue`/`enqueue`/`endQueue`) voices up to 2 sentences ahead and plays them back to back on one audio element (iOS-safe). Each reply has an id; a new message or `interrupt()` cancels the old reply's download, caption and voice. A watchdog moves on if a clip never reports ending. Measured: ~2 s from send to first spoken word on a long story (was 9–14 s). Spec: `docs/superpowers/specs/2026-09-30-streaming-voice-design.md`.

The backend uses the official `@anthropic-ai/sdk` (built-in retries).

### Interface

"BMO is the app": one show-accurate BMO fills the screen. BMO starts asleep; the big red button wakes it, then is tap-to-talk (Space on desktop). Replies show as a caption on BMO's screen while the mouth flaps in time with the voice. Icons below BMO: Talk mode, Type, Photos (album + camera), Messages (full history) and Settings (theme, voice, photos, About you). Design spec: `docs/superpowers/specs/2026-09-29-look-and-interface-design.md`.

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
- `src/components/CameraView.tsx`, `AlbumPanel.tsx` - BMO is camera + photo album
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

- Tests: `npm test` (Vitest). Unit tests live next to the code (`src/**/*.test.ts`); backend tests in `app.test.js` use Supertest with a blank API key so nothing reaches Anthropic or Fish Audio
- Free hosting sleeps: the page pings `/health` on load (`wakeBackend`), and `fetchBackend` retries network failures (2/5/10/20 s) while showing "BMO is waking up its brain…"
- Voice clips are cached on the device in Cache Storage (`src/utils/voiceCache.ts`, 150 clips, least recently used evicted)
- Prompt caching isn't used: BMO's prompt (~1-2K tokens) is below Haiku 4.5's 4,096-token minimum
- CORS whitelist in server.js: localhost, `FRONTEND_URL`, and `VERCEL_PROJECT_PREFIX` previews only
- Never commit — the owner commits changes themselves
- Dev server: the file watcher misses some edits on this machine (often ones made with the Edit tool). After editing, `touch` the changed files; if they're still stale, restart Vite.
- Scripts that edit code: write them with the Write tool. Heredocs mangle backslashes (\b became a backspace character in regexes once).
- Conversation history trimmed to last 6 messages before API calls
- Max tokens set to 300 for faster responses
