# BMO Companion - Your AI Friend from Adventure Time!

<div align="center">

![BMO](https://img.shields.io/badge/BMO-Adventure_Time-5dcdce?style=for-the-badge)
![Status](https://img.shields.io/badge/status-active-success?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

**A fully interactive 3D BMO companion with voice, personality, and soul!**

[Features](#features) • [Quick Start](#quick-start) • [Installation](#installation) • [Deployment](#deployment) • [Usage](#usage)

---

### Meet BMO - Now in 3D!

*"Hello friend! BMO is so happy to see you!"*

</div>

---

## What is This?

BMO Companion is a **fully-featured AI chatbot** bringing the lovable BMO character from Adventure Time to life! Talk to BMO using your voice, watch them respond with animated expressions and movements, and enjoy the authentic BMO personality powered by Claude AI.

### Why BMO?

- **Voice-First** - Talk naturally with speech-to-text
- **Authentic Voice** - Fish Audio with actual BMO voice from the show
- **3D Animated** - Floating BMO with moving arms and legs
- **Emotive** - Dynamic face expressions and body language
- **Musical** - Greeting songs and hidden special songs
- **Fast** - Optimized with dual-layer caching
- **Beautiful** - Retro gaming aesthetic with modern tech

---

## Features

### Voice Interaction
- **Speech-to-Text** - Talk to BMO naturally using Web Speech API
- **Text-to-Speech** - BMO responds with [Fish Audio](https://fish.audio) voice clone from Adventure Time
- **Auto-send** - Conversation flows naturally without clicking buttons
- **Visual Feedback** - Animated listening and speaking indicators

### 3D Character
- **Full 3D Model** - BMO rendered with Three.js
- **Floating Animation** - Gentle bobbing motion like floating in water
- **Moving Limbs** - Arms wave and legs swing naturally
- **Body Language** - Rotates and sways for life-like presence
- **Real-time Shadows** - Depth and realistic lighting

### Personality & Emotes
- **BMO Personality** - Childlike, innocent, enthusiastic character from the show
- **Emote Animations** - Expressions like `*excited*`, `*giggles*`, `*thinks*`
- **Mood System** - Happy, excited, sad, thinking, surprised, confused
- **Sound Effects** - Retro Game Boy style beeps and boops

### Special Features
- **Greeting Song** - BMO sings "Hello friend!" when you arrive
- **Hidden Song** - Secret romantic song (trigger: "BMO sing that song I taught you")
- **Musical Notes** - Floating animation during songs
- **Chiptune Melodies** - Web Audio API generated retro music

### UI Elements
- **Physical Buttons** - D-pad and XYAB buttons matching real BMO
- **Voice Controls** - TALK and VOICE toggle buttons
- **Quick Actions** - "Tell me a story!" button
- **Clean Interface** - Focus on voice and visuals, minimal clutter

### Performance
- **Dual-Layer Caching** - Frontend + Backend response caching
- **Instant Responses** - Cached answers return in ~5ms
- **Token Optimization** - Reduced max tokens (300) for faster generation
- **History Trimming** - Only last 6 messages sent to API
- **Performance Monitoring** - Console logs show response times

---

## Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Anthropic API Key** ([Get one](https://console.anthropic.com/))
- **Fish Audio API Key** ([Get one](https://fish.audio/app/api-keys/))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/bmo-companion.git
cd bmo-companion

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Add your API keys to .env
nano .env
```

### Configuration

Edit `.env`:

```env
# Anthropic API Key (Required)
# Get from: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxx

# Fish Audio API Key (Required for voice)
# Get from: https://fish.audio/app/api-keys/
FISH_AUDIO_API_KEY=FAK_xxxxxxxxxxxxxxxxxx
```

### Run

```bash
# Start both frontend and backend
npm start

# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

---

## Troubleshooting

### Voice Not Working

**Problem:** BMO doesn't speak

**Solutions:**
1. Check Fish Audio API key in `.env`
2. Restart backend: `npm start`
3. Check browser console for errors
4. Verify VOICE button is enabled (green)

### 401 Unauthorized Error

**Problem:** Fish Audio returns 401

**Solutions:**
1. Verify `FISH_AUDIO_API_KEY` in `.env` (no `VITE_` prefix!)
2. Generate new key: https://fish.audio/app/api-keys/
3. Restart servers

### 3D Model Not Rendering

**Problem:** Blank screen instead of BMO

**Solutions:**
1. Check browser console for Three.js errors
2. Verify WebGL support: https://get.webgl.org/
3. Update browser to latest version

---

## Usage

### Basic Interaction

**Voice Input:**
```
Click TALK → Speak → BMO responds with voice!
```

**Text Input:**
```
Type message → Press Enter → BMO responds
```

**Quick Actions:**
```
Click "Tell me a story!" → BMO tells a story
```

### Hidden Features

**Secret Song:**
Say: *"BMO sing that song I taught you"*
→ BMO performs a special romantic song!

**Emote Responses:**
BMO includes actions in speech:
```
BMO: "*excited* Oh boy! *bounces*"
→ Face shows excited
→ Plays chirp sound
→ Then speaks without asterisks
```

---

## Tech Stack

### Frontend
- **React** 18 + **TypeScript**
- **Vite** - Build tool & dev server
- **Three.js** - 3D rendering
- **Tailwind CSS** - Styling
- **Web Speech API** - Voice input
- **Web Audio API** - Sound generation

### Backend
- **Node.js** + **Express**
- **Anthropic API** - Claude AI
- **Fish Audio API** - Voice synthesis

---

## Performance

| Request Type | Time | Notes |
|-------------|------|-------|
| **Cached (exact)** | ~5ms | Frontend cache hit |
| **Cached (similar)** | ~50ms | Backend cache hit |
| **New question** | ~1200ms | API call to Claude |
| **Average** | ~400ms | 5x faster! |

---

## Credits

### Created By
- **Developer:** Naledi
- **For:** Erica
- **Inspired by:** Adventure Time (Cartoon Network)

### Technologies
- [Anthropic Claude](https://anthropic.com) - AI responses
- [Fish Audio](https://fish.audio) - Voice synthesis
- [Three.js](https://threejs.org) - 3D rendering

### Special Thanks
- Pendleton Ward - Creator of Adventure Time
- BMO character © Cartoon Network

---

<div align="center">

### Made with love for BMO fans everywhere!

**"BMO loves you so much!"**

</div>

