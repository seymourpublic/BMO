/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'press-start': ['"Press Start 2P"', 'cursive'],
        'orbitron': ['Orbitron', 'sans-serif'],
      },
      animation: {
        'blink': 'blink 4s infinite',
        'slideIn': 'slideIn 0.4s ease',
        'appear': 'appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-slow': 'bounce-slow 2s infinite ease-in-out',
        'scanline': 'scanline 8s linear infinite',
        'float': 'float 20s infinite linear',
      },
      keyframes: {
        blink: {
          '0%, 96%, 100%': { opacity: '1' },
          '98%': { opacity: '0' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        appear: {
          '0%': { opacity: '0', transform: 'scale(0.8) translateY(30px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'bounce-slow': {
          '0%, 100%': { transform: 'translateX(-50%) translateY(0)' },
          '50%': { transform: 'translateX(-50%) translateY(-5px)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        float: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(50px, 50px)' },
        },
      },
    },
  },
  plugins: [],
}
