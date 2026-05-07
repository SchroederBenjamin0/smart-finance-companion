import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Forest-green primary palette (design uses #0a2e1f as deepest tone)
        forest: {
          50: '#f0f9f3',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#166534',
          800: '#14532d',
          900: '#0e3a23',
          950: '#0a2e1f',
        },
        mint: {
          50: '#f0f9f3',
          100: '#eaf6ee',
          200: '#dcfce7',
        },
        paper: '#f2f2f7',
        ink: {
          DEFAULT: '#0a2e1f',
          muted: '#3d5a4d',
          subtle: '#7a8c84',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        '4xl': '32px',
        '5xl': '40px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 46, 31, 0.04), 0 4px 12px rgba(10, 46, 31, 0.06)',
        nav: '0 8px 24px rgba(10, 46, 31, 0.18)',
      },
      backgroundImage: {
        'hero-forest':
          'linear-gradient(160deg, #0a4d2e 0%, #22c55e 100%)',
        'card-fun':
          'linear-gradient(150deg, #10b981, #22c55e)',
        'card-savings':
          'linear-gradient(150deg, #0a4d2e, #16a34a)',
        'card-investment':
          'linear-gradient(150deg, #065f46, #10b981)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
} satisfies Config;
