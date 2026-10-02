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

describe('photos for BMO to look at', () => {
  const stream = body => request(app).post('/api/chat/stream').send(body);
  const tinyJpeg = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg bytes').toString('base64');

  it('rejects something that is not an image', async () => {
    expect((await stream({ image: 'hello', imageKind: 'snapshot' })).status).toBe(400);
    expect((await stream({ image: 'data:image/gif;base64,R0lGOD', imageKind: 'snapshot' })).status).toBe(400);
  });

  it('rejects photos that were not shrunk', async () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(420 * 1024);  // ~315 KB decoded
    expect((await stream({ image: big, imageKind: 'snapshot' })).status).toBe(400);
  });

  it('needs to know what kind of photo it is', async () => {
    expect((await stream({ image: tinyJpeg })).status).toBe(400);
    expect((await stream({ image: tinyJpeg, imageKind: 'memory', caption: 'x'.repeat(201) })).status).toBe(400);
  });

  it('accepts a shrunk photo (stops at the missing API key)', async () => {
    const res = await stream({ image: tinyJpeg, imageKind: 'memory', caption: 'Our first beach day' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/API key/);
  });

  it('allows a bigger request body only for the chat stream', async () => {
    const padded = { image: tinyJpeg, imageKind: 'snapshot', messages: [{ role: 'user', content: 'x'.repeat(1500) }], memory: { personality: 'y'.repeat(300) } };
    expect((await stream(padded)).status).toBe(500);  // Fine here
    const huge = { messages: [{ role: 'user', content: 'hi' }], padding: 'z'.repeat(400 * 1024) };
    expect((await request(app).post('/api/chat').send(huge)).status).toBe(413);  // Too big elsewhere
  });
});

describe('growing BMO', () => {
  // Its own IP, so these requests don't use up the other tests' rate limit
  const stream = body => request(app).post('/api/chat/stream').set('X-Forwarded-For', '10.0.0.7').send(body);
  const chat = body => request(app).post('/api/chat').set('X-Forwarded-For', '10.0.0.7').send(body);

  it('accepts words and recent diary lines in memory', async () => {
    const memory = { name: 'Sam', words: [{ word: 'lekker', meaning: 'great' }], diary: ['Sam taught BMO a song.'] };
    expect((await chat({ messages: hi, memory })).status).toBe(500);  // Valid; only the key is missing
  });

  it.each([
    ['too many words', { words: Array(16).fill({ word: 'x' }) }],
    ['a word that is too long', { words: [{ word: 'x'.repeat(41) }] }],
    ['too many diary lines', { diary: ['a', 'b', 'c', 'd'] }],
    ['a diary line that is too long', { diary: ['x'.repeat(161)] }],
  ])('rejects memory with %s', async (_label, memory) => {
    expect((await chat({ messages: hi, memory })).status).toBe(400);
  });

  it('accepts a follow-up with a greeting or a nudge', async () => {
    expect((await stream({ greeting: { hoursAway: 20, hour: 9, visits: 4 }, followUp: 'Friend was trying dumplings again' })).status).toBe(500);
    expect((await stream({ nudge: true, followUp: 'Exam on Friday' })).status).toBe(500);
    expect((await stream({ nudge: true, followUp: 'x'.repeat(121) })).status).toBe(400);
  });

  it('accepts known milestones only', async () => {
    expect((await stream({ milestone: 'chats-100' })).status).toBe(500);  // Valid; only the key is missing
    expect((await stream({ milestone: 'days-9999' })).status).toBe(400);
    expect((await stream({ milestone: '__proto__' })).status).toBe(400);
  });

  it('cleans up what a memory update learned', async () => {
    const { sanitizeGrowth } = await import('./app.js');
    const growth = sanitizeGrowth({
      followUps: [
        { about: 'Friend is trying dumplings again on Saturday', askAfter: '2026-10-04' },
        { about: 'In the past', askAfter: '2026-09-01' },
        { about: 'Too far away', askAfter: '2027-06-01' },
        { about: 'Not a date', askAfter: 'next week' },
        { about: '', askAfter: '2026-10-05' }
      ],
      words: [{ word: 'lekker', meaning: 'great, tasty' }, { word: 'eish' }, { word: '' }, { word: 'a' }, { word: 'b' }],
      diary: 'x'.repeat(300)
    }, '2026-10-01');
    expect(growth.followUps).toEqual([{ about: 'Friend is trying dumplings again on Saturday', askAfter: '2026-10-04' }]);
    expect(growth.words).toEqual([{ word: 'lekker', meaning: 'great, tasty' }, { word: 'eish' }, { word: 'a' }]);
    expect(growth.diary).toHaveLength(160);
  });

  it('survives a memory update that returned nothing useful', async () => {
    const { sanitizeGrowth } = await import('./app.js');
    expect(sanitizeGrowth({ followUps: 'nope', words: null }, '2026-10-01')).toEqual({ followUps: [], words: [], diary: '' });
  });

  it('asks about the follow-up and keeps the diary private in the prompt', async () => {
    const { buildFollowUpLine, buildMemoryBlock, buildGreetingTurn } = await import('./personality.js');
    expect(buildGreetingTurn({ hoursAway: 20, hour: 9, visits: 4 }) + buildFollowUpLine('Exam on Friday')).toMatch(/Exam on Friday/);
    expect(buildFollowUpLine(undefined)).toBe('');
    const block = buildMemoryBlock({ notes: [], words: [{ word: 'lekker', meaning: 'great' }], diary: ['BMO learned a song.'] });
    expect(block).toContain('lekker (great)');
    expect(block).toMatch(/Never read it out/);
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

describe('kitchen', () => {
  // Its own IP, so these requests don't use up the other tests' rate limit
  const post = (path, body) => request(app).post(path).set('X-Forwarded-For', '10.0.0.8').send(body);
  const kitchen = { title: 'Bobotie', step: 'Fry the onions until soft.', stepNumber: 2, totalSteps: 8, ingredients: ['2 onions', '500 g mince'] };

  it('accepts a kitchen-mode chat with the current step', async () => {
    expect((await post('/api/chat', { messages: hi, mode: 'kitchen', kitchen })).status).toBe(500);  // Valid; only the key is missing
  });

  it.each([
    ['a step number past the end', { ...kitchen, stepNumber: 9 }],
    ['too many ingredients', { ...kitchen, ingredients: Array(26).fill('salt') }],
    ['a step that is too long', { ...kitchen, step: 'x'.repeat(241) }],
    ['a missing title', { ...kitchen, title: undefined }],
  ])('rejects kitchen context with %s', async (_label, bad) => {
    expect((await post('/api/chat', { messages: hi, mode: 'kitchen', kitchen: bad })).status).toBe(400);
  });

  it('needs a photo or a request to make a recipe', async () => {
    expect((await post('/api/recipe', {})).status).toBe(400);
    expect((await post('/api/recipe', { request: '   ' })).status).toBe(400);
    expect((await post('/api/recipe', { request: 'x'.repeat(301) })).status).toBe(400);
    expect((await post('/api/recipe', { image: 'not an image' })).status).toBe(400);
  });

  it('accepts a dish name or a recipe photo (stops at the missing API key)', async () => {
    expect((await post('/api/recipe', { request: 'bobotie' })).status).toBe(500);
    const photo = 'data:image/jpeg;base64,' + Buffer.from('fake recipe photo').toString('base64');
    expect((await post('/api/recipe', { image: photo })).status).toBe(500);
  });

  it('cleans up a recipe from the model', async () => {
    const { sanitizeRecipe } = await import('./app.js');
    const { recipe } = sanitizeRecipe({
      title: '  Bobotie ', servings: '4 people', minutes: 75.4, bmoVersion: true,
      ingredients: ['500 g mince', '', 42, 'x'.repeat(100)],
      steps: Array.from({ length: 25 }, (_, i) => `Step ${i + 1}`)
    }, false);
    expect(recipe.title).toBe('Bobotie');
    expect(recipe.minutes).toBe(75);
    expect(recipe.ingredients).toEqual(['500 g mince', 'x'.repeat(80)]);
    expect(recipe.steps).toHaveLength(20);
    expect(recipe.bmoVersion).toBe(true);
    expect(recipe.fromPhoto).toBe(false);
  });

  it('never calls a copied recipe "BMO\'s version"', async () => {
    const { sanitizeRecipe } = await import('./app.js');
    expect(sanitizeRecipe({ title: 'Mum\'s soup', steps: ['Boil'], bmoVersion: true }, true).recipe.bmoVersion).toBe(false);
  });

  it('says unreadable instead of inventing a recipe', async () => {
    const { sanitizeRecipe } = await import('./app.js');
    expect(sanitizeRecipe({ unreadable: true }, true)).toEqual({ unreadable: true });
    expect(sanitizeRecipe({ title: 'Something', steps: [] }, false)).toEqual({ unreadable: true });
    expect(sanitizeRecipe(null, false)).toEqual({ unreadable: true });
  });
});

describe('study', () => {
  // Its own IP, so these requests don't use up the other tests' rate limit
  const post = (path, body) => request(app).post(path).set('X-Forwarded-For', '10.0.0.9').send(body);
  const notes = 'data:image/jpeg;base64,' + Buffer.from('fake notes photo').toString('base64');

  it('accepts a teach-BMO chat', async () => {
    expect((await post('/api/chat', { messages: hi, mode: 'teach' })).status).toBe(500);  // Valid; only the key is missing
  });

  it('needs a notes photo to make a quiz', async () => {
    expect((await post('/api/quiz', {})).status).toBe(400);
    expect((await post('/api/quiz', { image: 'nope' })).status).toBe(400);
    expect((await post('/api/quiz', { image: notes })).status).toBe(500);  // Valid; only the key is missing
  });

  it('checks the parts of a quiz answer', async () => {
    expect((await post('/api/quiz/check', { question: 'What is interest?', expected: 'The cost of borrowing money' })).status).toBe(400);
    expect((await post('/api/quiz/check', { question: '', expected: 'x', answer: 'y' })).status).toBe(400);
    expect((await post('/api/quiz/check', { question: 'Q', expected: 'A', answer: 'x'.repeat(501) })).status).toBe(400);
    expect((await post('/api/quiz/check', { question: 'Q', expected: 'A', answer: 'my answer' })).status).toBe(500);
  });

  it('cleans up a quiz from the model', async () => {
    const { sanitizeQuiz } = await import('./app.js');
    const { quiz } = sanitizeQuiz({
      topic: ' Compound interest ',
      questions: [
        ...Array.from({ length: 10 }, (_, i) => ({ q: `Q${i}`, answer: `A${i}`, why: 'because' })),
        { q: 'No answer' }
      ]
    });
    expect(quiz.topic).toBe('Compound interest');
    expect(quiz.questions).toHaveLength(8);
    expect(quiz.questions[0]).toEqual({ q: 'Q0', answer: 'A0', why: 'because' });
  });

  it('says unreadable rather than making a tiny quiz', async () => {
    const { sanitizeQuiz } = await import('./app.js');
    expect(sanitizeQuiz({ unreadable: true })).toEqual({ unreadable: true });
    expect(sanitizeQuiz({ topic: 'x', questions: [{ q: 'a', answer: 'b' }, { q: 'c', answer: 'd' }] })).toEqual({ unreadable: true });
  });

  it('only accepts known verdicts with a reply', async () => {
    const { sanitizeVerdict } = await import('./app.js');
    expect(sanitizeVerdict({ verdict: 'right', reply: ' Yay! ' })).toEqual({ verdict: 'right', reply: 'Yay!' });
    expect(sanitizeVerdict({ verdict: 'maybe', reply: 'Hmm' })).toBeNull();
    expect(sanitizeVerdict({ verdict: 'notYet', reply: '' })).toBeNull();
  });
});

describe('fashion show', () => {
  // Its own IP, so these requests don't use up the other tests' rate limit
  const post = (path, body) => request(app).post(path).set('X-Forwarded-For', '10.0.0.10').send(body);
  const selfie = 'data:image/jpeg;base64,' + Buffer.from('fake selfie').toString('base64');

  it('needs a photo and a known style', async () => {
    expect((await post('/api/fashion', { style: 'runway' })).status).toBe(400);
    expect((await post('/api/fashion', { image: selfie })).status).toBe(400);
    expect((await post('/api/fashion', { image: selfie, style: 'catwalk' })).status).toBe(400);
    expect((await post('/api/fashion', { image: selfie, style: 'runway' })).status).toBe(500);  // Valid; only the key is missing
    expect((await post('/api/fashion', { image: selfie, style: 'check' })).status).toBe(500);
  });

  it('needs 2 to 6 short award titles for the finale', async () => {
    expect((await post('/api/fashion/finale', { awards: ['Only one'] })).status).toBe(400);
    expect((await post('/api/fashion/finale', { awards: Array(7).fill('Sparkly') })).status).toBe(400);
    expect((await post('/api/fashion/finale', { awards: ['Sparkly', 'x'.repeat(41)] })).status).toBe(400);
    expect((await post('/api/fashion/finale', { awards: ['Sparkly', 'Cosiest'] })).status).toBe(500);
  });

  it('cleans up a judged look', async () => {
    const { sanitizeFashion } = await import('./app.js');
    expect(sanitizeFashion({ award: ' Most Sparkly ', comment: 'Wow!', accessory: 'tiara', colour: '#D94F8A', tip: 'Add a bow' }, 'runway'))
      .toEqual({ award: 'Most Sparkly', comment: 'Wow!', accessory: 'tiara', colour: '#d94f8a' });
    expect(sanitizeFashion({ award: 'Cosy', comment: 'Lovely', accessory: 'tiara', colour: '#123456', tip: ' A gold necklace! ' }, 'check').tip)
      .toBe('A gold necklace!');
  });

  it('never lets an odd answer through', async () => {
    const { sanitizeFashion } = await import('./app.js');
    const result = sanitizeFashion({ award: 'x'.repeat(80), accessory: 'jetpack', colour: 'pink' }, 'runway');
    expect(result.award).toHaveLength(40);
    expect(result.comment).toBeTruthy();
    expect(result.accessory).toBe('bow');
    expect(result.colour).toBe('');
    expect(sanitizeFashion(null, 'check')).toMatchObject({ award: 'Most Fabulous', accessory: 'bow' });
  });

  it('keeps the finale winner in range', async () => {
    const { sanitizeFinale } = await import('./app.js');
    expect(sanitizeFinale({ winner: 1, line: ' Look of the Night! ' }, 3)).toEqual({ winner: 1, line: 'Look of the Night!' });
    expect(sanitizeFinale({ winner: 7, line: 'Hi' }, 3).winner).toBe(0);
    expect(sanitizeFinale(null, 2)).toEqual({ winner: 0, line: '' });
    expect(sanitizeFinale({ winner: 0, line: 'Pure magic! *confetti* Thank you!' }, 2).line).toBe('Pure magic! Thank you!');
  });

  it('keeps the judging kind and about the clothes', async () => {
    const { buildFashionPrompt } = await import('./personality.js');
    const prompt = buildFashionPrompt('runway');
    expect(prompt).toMatch(/NEVER mention their body, weight/);
    expect(prompt).not.toMatch(/"tip"/);
  });
});
