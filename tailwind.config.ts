import type { Config } from 'tailwindcss';

/**
 * Colour system — "Ink" direction.
 *
 * Every themeable colour is defined as an `rgb(var(--x) / <alpha-value>)` token
 * so that (a) Tailwind opacity modifiers like `bg-forest-950/10` keep working,
 * and (b) the runtime theme engine (`src/lib/theme.ts`) can repaint the whole
 * app — presets *and* a user-chosen custom accent — by rewriting the CSS
 * variables on `:root`. Nothing in components hardcodes hex values.
 *
 * The `forest` scale keeps its old key names purely so the ~40 existing
 * `bg-forest-950` / `text-forest-800` usages don't need touching — but the
 * values are now a navy→blue accent ramp. `mint` = soft accent tints.
 */
const ch = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Accent ramp (was forest-green, now navy→blue). Runtime-themeable.
        forest: {
          50: ch('--f-50'),
          100: ch('--f-100'),
          200: ch('--f-200'),
          300: ch('--f-300'),
          400: ch('--f-400'),
          500: ch('--f-500'),
          600: ch('--f-600'),
          700: ch('--f-700'),
          800: ch('--f-800'),
          900: ch('--f-900'),
          950: ch('--f-950'),
        },
        // Soft accent tints (AI banners, chips).
        mint: {
          50: ch('--m-50'),
          100: ch('--m-100'),
          200: ch('--m-200'),
        },
        // Semantic neutral tokens — dark mode + palette swap these vars.
        paper: ch('--color-paper'),
        surface: ch('--color-surface'),
        divider: ch('--color-divider'),
        hero: ch('--color-hero'),
        ink: {
          DEFAULT: ch('--color-ink'),
          muted: ch('--color-ink-muted'),
          subtle: ch('--color-ink-subtle'),
        },
      },
      fontFamily: {
        sans: [
          'var(--font-app)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        caption: ['11px', { lineHeight: '1.3' }],
        meta: ['12px', { lineHeight: '1.35' }],
        label: ['13px', { lineHeight: '1.4' }],
        body: ['15px', { lineHeight: '1.45' }],
        heading: ['17px', { lineHeight: '1.3' }],
        title: ['22px', { lineHeight: '1.2', letterSpacing: '-0.5px' }],
        page: ['30px', { lineHeight: '1.05', letterSpacing: '-0.7px' }],
        'display-sm': ['28px', { lineHeight: '1.1', letterSpacing: '-0.6px' }],
        display: ['44px', { lineHeight: '1.0', letterSpacing: '-1.2px' }],
      },
      borderRadius: {
        // "weniger runde Ecken" — Ink geometry.
        card: '12px',
        control: '10px',
        chip: '8px',
        hero: '18px',
        '4xl': '18px', // legacy alias used by HeroHeader (rounded-b-4xl)
        '5xl': '22px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 38, 79, 0.04), 0 4px 12px rgba(20, 38, 79, 0.06)',
        nav: '0 12px 32px -8px rgba(20, 38, 79, 0.35), 0 4px 8px rgba(20, 38, 79, 0.16)',
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
