// BMO colour themes. "original" matches the show; the others are like BMO's
// differently-coloured MO siblings.

export interface BMOTheme {
  name: string;
  body: string;       // Main body colour
  bodyShade: string;  // Inner shadow on the body's lower/right edge
  outline: string;    // Body and screen outline, slot, ports
  screen: string;     // Screen background
  face: string;       // Eyes and mouth
}

export const COLOR_THEMES = {
  original: { name: 'BMO',    body: '#65c3ab', bodyShade: '#4fa994', outline: '#2c6e62', screen: '#c6f3d2', face: '#15241f' },
  blue:     { name: 'Blue',   body: '#5aa9e6', bodyShade: '#3f8ccb', outline: '#1f4f7a', screen: '#cfe8ff', face: '#10233a' },
  pink:     { name: 'Pink',   body: '#f59ac6', bodyShade: '#e07aab', outline: '#8b2f5c', screen: '#ffe0ef', face: '#3a0f24' },
  red:      { name: 'Red',    body: '#e8736b', bodyShade: '#cf5750', outline: '#7a2420', screen: '#ffd9d5', face: '#3a0e0b' },
  white:    { name: 'White',  body: '#eef2f2', bodyShade: '#cfd8d8', outline: '#7b8a8a', screen: '#e2f7ea', face: '#1d2b2b' },
  purple:   { name: 'Purple', body: '#a98bd8', bodyShade: '#8d6fc0', outline: '#4a2f78', screen: '#ece2ff', face: '#22133d' },
  black:    { name: 'Black',  body: '#3b4652', bodyShade: '#2a333c', outline: '#11161b', screen: '#9fe3b4', face: '#0c1a12' },
  // Secret: unlocked by the Konami code
  rainbow:  {
    name: 'Rainbow',
    body: 'linear-gradient(160deg, #ff8fa3, #ffc46b, #fff37a, #8ef0a1, #7fc8ff, #b99bff)',
    bodyShade: 'rgba(0, 0, 0, 0.12)',
    outline: '#4a3a78',
    screen: '#f2ffe9',
    face: '#241a3d'
  },
} satisfies Record<string, BMOTheme>;

// Themes that only appear once unlocked
export const SECRET_THEMES: ThemeName[] = ['rainbow'];

export type ThemeName = keyof typeof COLOR_THEMES;

const THEME_KEY = 'bmo-theme';

export const loadTheme = (): ThemeName => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && saved in COLOR_THEMES) return saved as ThemeName;
  } catch {
    // Storage blocked (private mode etc.) - use the default
  }
  return 'original';
};

export const saveTheme = (theme: ThemeName) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not critical if it doesn't persist
  }
};
