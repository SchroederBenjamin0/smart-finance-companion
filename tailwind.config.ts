import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
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
        // Semantic tokens — resolved via CSS variables so dark-mode
        // overrides in index.css automatically update all usages.
        paper: 'var(--color-paper)',
        surface: 'var(--color-surface)',
        divider: 'var(--color-divider)',
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-ink-muted)',
          subtle: 'var(--color-ink-subtle)',
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
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'sheet-down': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(100%)' },
        },
        'view-enter': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'list-enter': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '60%': { transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'fade-out': 'fade-out 180ms ease-out',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        'sheet-down': 'sheet-down 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'view-enter': 'view-enter 220ms ease-out',
        'list-enter': 'list-enter 240ms ease-out backwards',
        'pop-in': 'pop-in 240ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
} satisfies Config;
