// Backend tests. They send real HTTP requests to the Express app (without starting a server)
// and never reach Anthropic or Fish Audio: the API key is blanked, so every request that
// passes validation stops at "API key not configured".
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

let app;

beforeAll(async () => {
  // No real network calls in tests (the weather lookup uses fetch); it fails safely
  vi.stubGlobal('fetch', async () => { throw new Error('No network in tests'); });
  // Set before app.js loads (dotenv never overrides variables that already exist)
  process.env.ANTHROPIC_API_KEY = '';
  process.env.FISH_AUDIO_API_KEY = '';
  process.env.FRONTEND_URL = 'https://bmo-neon.vercel.app/';  // Trailing slash on purpose
  process.env.BMO_SPECIAL_JSON = JSON.stringify({
    friendName: 'Robin',
    friendPronouns: 'she/her',
    creatorLabel: 'my friend',
    messagesFrom: 'Someone',
    comfortMessages: ['You are doing great.'],
    occasions: [
      { id: 'birthday', kind: 'birthday', month: 9, day: 17, message: 'Happy birthday!' },
      { id: 'met', kind: 'met', month: 10, message: 'The month you met!' }
    ],
    songs: [
      { id: 'original', melody: 'special', lyrics: 'Original song' },
      { id: 'bright', melody: 'bright', lyrics: 'Bright song' }
    ]
  });
  ({ app } = await import('./app.js'));
});

const chat = body => request(app).post('/api/chat').send(body);
const hi = [{ role: 'user', content: 'hi' }];

describe('CORS', () => {
  const preflight = origin => request(app)
    .options('/api/chat/stream')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type');

  it('allows the frontend even though FRONTEND_URL has a trailing slash', async () => {
    const res = await preflight('https://bmo-neon.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBe('https://bmo-neon.vercel.app');
  });

  it('allows local development', async () => {
    const res = await preflight('http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('blocks other websites', async () => {
    const res = await preflight('https://evil.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('chat validation', () => {
  it.each([
    ['no messages', {}],
    ['too many messages', { messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' })) }],
    ['a system role', { messages: [{ role: 'system', content: 'x' }] }],
    ['a message that is too long', { messages: [{ role: 'user', content: 'x'.repeat(2001) }] }],
    ['an unknown mode', { messages: hi, mode: 'pirate' }],
    ['a bad hour', { messages: hi, hour: 25 }],
    ['a name in memory that is too long', { messages: hi, memory: { name: 'x'.repeat(41) } }],
    ['too many memory notes', { messages: hi, memory: { notes: Array(21).fill('note') } }],
    ['a "now" that is too long', { messages: hi, now: 'x'.repeat(61) }],
    ['a "now" that is not text', { messages: hi, now: 12 }],
    ['an unknown occasion', { messages: hi, occasion: 'wedding' }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await chat(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('accepts a valid request (stops at the missing API key)', async () => {
    const res = await chat({ messages: hi, mode: 'detective', hour: 23, memory: { name: 'Sam', notes: ['Likes cats'] } });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/API key/);
  });

  it('accepts the date and time', async () => {
    const res = await chat({ messages: hi, now: 'Thursday 1 October 2026, 2:05 pm', hour: 14 });
    expect(res.status).toBe(500);  // Valid; only the key is missing
  });

  it('accepts a nudge (BMO speaking first) without messages', async () => {
    const res = await chat({ nudge: true });
    expect(res.status).toBe(500);  // Valid; only the key is missing
  });

  it('still checks messages sent with a nudge', async () => {
    const res = await chat({ nudge: true, messages: [{ role: 'system', content: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('accepts a greeting without messages', async () => {
    const res = await chat({ greeting: { hoursAway: 3, hour: 9, visits: 2 } });
    expect(res.status).toBe(500);  // Valid; only the key is missing
  });
});

describe('special friend', () => {
  it('recognises the friend by name, ignoring case and spaces', async () => {
    const res = await request(app).post('/api/special/recognise').send({ name: '  robin ' });
    expect(res.body).toEqual({ special: true, name: 'Robin', pronouns: 'she/her' });
  });

  it('does not recognise anyone else', async () => {
    const res = await request(app).post('/api/special/recognise').send({ name: 'Bob' });
    expect(res.body).toEqual({ special: false });
  });

  it('shares the original song with anyone', async () => {
    const res = await request(app).post('/api/special/song').send({ id: 'original' });
    expect(res.status).toBe(200);
    expect(res.body.lyrics).toBe('Original song');
  });

  it('keeps the friend\'s own songs for the friend', async () => {
    expect((await request(app).post('/api/special/song').send({ id: 'bright' })).status).toBe(400);
    expect((await request(app).post('/api/special/song').send({ id: 'bright', special: true })).status).toBe(200);
  });

  it('404s for a song that does not exist', async () => {
    expect((await request(app).post('/api/special/song').send({ id: 'nope', special: true })).status).toBe(404);
  });
});

describe('special days', () => {
  const today = body => request(app).post('/api/special/today').send(body);

  it('finds the birthday on its exact day', async () => {
    const res = await today({ month: 9, day: 17, special: true });
    expect(res.body.occasion).toEqual({ id: 'birthday', kind: 'birthday', message: 'Happy birthday!' });
  });

  it('treats a day-less occasion as the whole month', async () => {
    expect((await today({ month: 10, day: 1, special: true })).body.occasion?.id).toBe('met');
    expect((await today({ month: 10, day: 31, special: true })).body.occasion?.id).toBe('met');
  });

  it('returns nothing on ordinary days', async () => {
    expect((await today({ month: 9, day: 18, special: true })).body.occasion).toBeNull();
  });

  it('never reveals dates, and only answers for the special friend', async () => {
    const res = await today({ month: 9, day: 17, special: true });
    expect(JSON.stringify(res.body)).not.toMatch(/"month"|"day"/);
    expect((await today({ month: 9, day: 17 })).body.occasion).toBeNull();
  });

  it('rejects impossible dates', async () => {
    expect((await today({ month: 13, day: 1, special: true })).status).toBe(400);
  });
});

describe('text to speech', () => {
  it('requires text', async () => {
    expect((await request(app).post('/api/tts').send({ text: '   ' })).status).toBe(400);
  });
});

// Keep this last: it uses up the rate limit for the test client
describe('rate limit', () => {
  it('returns 429 after 20 chat requests in a minute', async () => {
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await chat({ messages: hi })).status);
    expect(statuses).toContain(429);
    expect(statuses.indexOf(429)).toBeGreaterThan(0);
  });
});
