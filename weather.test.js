import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeWeather, weatherCodeText } from './weather.js';

afterEach(() => vi.unstubAllGlobals());

// Fake fetch that answers the location and forecast services
const fakeFetch = (location, forecast) => async url => ({
  ok: true,
  json: async () => (String(url).includes('ipwho.is') ? location : forecast)
});

describe('weatherCodeText', () => {
  it.each([
    [0, 'clear sky'],
    [3, 'overcast'],
    [61, 'rain'],
    [65, 'heavy rain'],
    [95, 'thunderstorm'],
    [1234, 'unusual weather'],
  ])('code %i → %s', (code, text) => {
    expect(weatherCodeText(code)).toBe(text);
  });
});

describe('describeWeather', () => {
  it('describes the weather for the friend\'s city', async () => {
    vi.stubGlobal('fetch', fakeFetch(
      { success: true, city: 'Johannesburg', latitude: -26.2, longitude: 28.04 },
      { current: { temperature_2m: 21.6, weather_code: 61, is_day: 1 } }
    ));
    expect(await describeWeather('41.0.0.1')).toBe('Johannesburg: 22°C, rain, daytime');
  });

  it('falls back to GeoJS when ipwho.is fails', async () => {
    vi.stubGlobal('fetch', async url => {
      const u = String(url);
      if (u.includes('ipwho.is')) return { ok: false, status: 503, json: async () => ({}) };
      if (u.includes('geojs')) return { ok: true, json: async () => ({ city: 'Cape Town', latitude: '-33.9', longitude: '18.4' }) };
      return { ok: true, json: async () => ({ current: { temperature_2m: 17.2, weather_code: 3, is_day: 0 } }) };
    });
    expect(await describeWeather('41.0.0.1')).toBe('Cape Town: 17°C, overcast, night-time');
  });

  it('returns null when both location services fail', async () => {
    vi.stubGlobal('fetch', fakeFetch({ success: false }, {}));
    expect(await describeWeather('41.0.0.1')).toBeNull();
  });

  it('returns null when the forecast has no temperature', async () => {
    vi.stubGlobal('fetch', fakeFetch({ success: true, city: 'X', latitude: 1, longitude: 2 }, { current: {} }));
    expect(await describeWeather('41.0.0.1')).toBeNull();
  });

  it('asks about the server\'s own address for local requests', async () => {
    const urls = [];
    vi.stubGlobal('fetch', async url => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ success: false }) };
    });
    await describeWeather('::1');
    expect(urls[0]).toBe('https://ipwho.is/');
  });
});
