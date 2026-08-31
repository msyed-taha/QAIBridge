/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        quantum: {
          900: '#0d0d1a',
          800: '#12122b',
          700: '#1a1a3e',
          600: '#252560',
          500: '#3333aa',
          400: '#5555cc',
          300: '#7777ee',
          neon: '#00ffcc',
          purple: '#cc44ff',
          pink: '#ff44aa',
        },
      },
      fontFamily: {
        mono: ['Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
