/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
          'deficit-high': 'var(--fit-balance-deficit-high)',
          'deficit-medium': 'var(--fit-balance-deficit-medium)',
          'deficit-low': 'var(--fit-balance-deficit-low)',
          'neutral': 'var(--fit-balance-neutral)',
          'surplus-low': 'var(--fit-balance-surplus-low)',
          'surplus-medium': 'var(--fit-balance-surplus-medium)',
          'surplus-high': 'var(--fit-balance-surplus-high)',
          'empty': 'var(--fit-balance-empty)',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
