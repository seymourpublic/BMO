// Rough local weather for the friend, so BMO can say "it's raining by you!".
// Location comes from the request's IP address (city level, no permission prompt):
// ipwho.is (or GeoJS as a backup) turns the IP into a city + coordinates, and Open-Meteo
// gives the current weather. All free, no API keys. Any failure just means no weather talk.

const CACHE_MS = 30 * 60 * 1000;     // Reuse a lookup for 30 minutes per IP
const FAILURE_CACHE_MS = 2 * 60 * 1000;  // After a failure, try again sooner
const FETCH_TIMEOUT_MS = 2500;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map();             // ip -> { text, expiresAt }
const inFlight = new Map();          // ip -> Promise<string | null>

// WMO weather codes (used by Open-Meteo) in plain words
const WEATHER_CODES = [
  [[0], 'clear sky'],
  [[1], 'mostly clear'],
  [[2], 'partly cloudy'],
  [[3], 'overcast'],
  [[45, 48], 'foggy'],
  [[51, 53, 55, 56, 57], 'drizzle'],
  [[61, 63, 66, 80, 81], 'rain'],
  [[65, 67, 82], 'heavy rain'],
  [[71, 73, 77, 85], 'snow'],
  [[75, 86], 'heavy snow'],
  [[95], 'thunderstorm'],
  [[96, 99], 'thunderstorm with hail'],
];

export const weatherCodeText = code =>
  WEATHER_CODES.find(([codes]) => codes.includes(code))?.[1] ?? 'unusual weather';

// Local or private addresses can't be located; ask about the server's own address instead
// (useful in development, where the "friend" is on the same machine)
const isPrivateIp = ip =>
  !ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip.startsWith('::ffff:127.') || ip.startsWith('fc') || ip.startsWith('fd');

const getJson = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

// City and coordinates for an IP: ipwho.is first, GeoJS if that fails. Null if neither works.
async function locate(ip) {
  const own = isPrivateIp(ip);
  try {
    const where = await getJson(`https://ipwho.is/${own ? '' : encodeURIComponent(ip)}`);
    if (where?.success && typeof where.latitude === 'number') {
      return { place: where.city || where.region || where.country, latitude: where.latitude, longitude: where.longitude };
    }
  } catch (error) {
    console.warn('🌦️ ipwho.is failed, trying GeoJS:', error.message);
  }
  const where = await getJson(`https://get.geojs.io/v1/ip/geo${own ? '' : `/${encodeURIComponent(ip)}`}.json`);
  const latitude = Number(where?.latitude);
  const longitude = Number(where?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { place: where.city || where.region || where.country, latitude, longitude };
}

// Look up the weather text for an IP (e.g. "Johannesburg: 22°C, light rain, daytime"), or null
export async function describeWeather(ip) {
  const location = await locate(ip);
  if (!location) return null;

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'auto'
  });
  const forecast = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
  const current = forecast?.current;
  if (!current || typeof current.temperature_2m !== 'number') return null;

  const place = location.place || 'where the friend is';
  return `${place}: ${Math.round(current.temperature_2m)}°C, ${weatherCodeText(current.weather_code)}, ${current.is_day ? 'daytime' : 'night-time'}`;
}

// Start (or reuse) a lookup for this IP. Never throws.
export function lookupWeather(ip) {
  const key = ip || 'unknown';
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.text);
  if (inFlight.has(key)) return inFlight.get(key);

  const lookup = describeWeather(ip)
    .catch(error => {
      console.warn('🌦️ Weather lookup failed:', error.message);
      return null;
    })
    .then(text => {
      cache.set(key, { text, expiresAt: Date.now() + (text ? CACHE_MS : FAILURE_CACHE_MS) });
      if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      inFlight.delete(key);
      return text;
    });
  inFlight.set(key, lookup);
  return lookup;
}

// Weather for a chat: use what's ready, wait only briefly for a lookup in progress
export async function weatherForChat(ip, waitMs = 300) {
  return Promise.race([lookupWeather(ip), new Promise(resolve => setTimeout(() => resolve(null), waitMs))]);
}
