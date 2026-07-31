/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'uno-dark': '#0f0f1a',
        'uno-panel': '#1a1a2e',
        'uno-accent': '#1e2a4a',
        'uno-red': '#e74c3c',
        'uno-green': '#27ae60',
        'uno-blue': '#3498db',
        'uno-yellow': '#f1c40f',
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};