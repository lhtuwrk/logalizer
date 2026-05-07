/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0d10',
          elev: '#11141a',
          panel: '#151921',
          hover: '#1b212c',
        },
        border: {
          DEFAULT: '#222833',
          subtle: '#1a1f29',
        },
        text: {
          DEFAULT: '#e6e8ec',
          muted: '#8a93a3',
          dim: '#5a6370',
        },
        accent: {
          DEFAULT: '#7aa2ff',
          hover: '#9bb8ff',
        },
        level: {
          info: '#5b8cff',
          warn: '#f5a524',
          error: '#ef4444',
          fatal: '#b91c1c',
          debug: '#8a93a3',
          trace: '#5a6370',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
