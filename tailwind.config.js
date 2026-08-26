/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        github: {
          bg: '#0d1117',
          card: '#161b22',
          border: '#30363d',
          text: '#c9d1d9',
          muted: '#8b949e',
        },
        heatmap: {
          'deficit-high': '#15803d',
          'deficit-medium': '#22c55e',
          'deficit-low': '#86efac',
          'neutral': '#6b7280',
          'surplus-low': '#fca5a5',
          'surplus-medium': '#ef4444',
          'surplus-high': '#991b1b',
          'empty': '#21262d',
        }
      }
    },
  },
  plugins: [],
}
