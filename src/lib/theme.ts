/**
 * Runtime theme engine for the "Ink" design.
 *
 * The whole app is painted from CSS variables declared in `index.css`
 * (`--color-*`, `--f-*`, `--m-*`, `--font-app`). This module resolves a
 * {@link ThemeConfig} into concrete values and writes them onto
 * `document.documentElement`, so presets *and* a user-picked custom accent
 * repaint every view without touching component code.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type PaletteId = 'ink' | 'graphite' | 'plum' | 'custom';
export type FontId = 'inter' | 'system' | 'rounded' | 'serif' | 'mono';

export interface ThemeConfig {
  mode: ThemeMode;
  paletteId: PaletteId;
  /** hex accent used when `paletteId === 'custom'` */
  customAccent: string;
  fontId: FontId;
}

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'system',
  paletteId: 'ink',
  customAccent: '#2f5fe0',
  fontId: 'inter',
};

export const PALETTE_LABELS: Record<Exclude<PaletteId, 'custom'>, string> = {
  ink: 'Ink',
  graphite: 'Graphite',
  plum: 'Plum',
};

export const FONT_STACKS: Record<FontId, { label: string; stack: string }> = {
  inter: { label: 'Inter', stack: "'Inter'" },
  system: { label: 'System', stack: '-apple-system, BlinkMacSystemFont, system-ui' },
  rounded: { label: 'Rounded', stack: "ui-rounded, 'SF Pro Rounded', system-ui" },
  serif: { label: 'Serif', stack: "ui-serif, 'New York', Georgia, serif" },
  mono: { label: 'Mono', stack: "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace" },
};

// ─── Neutral + accent anchors per preset (from the Ink handoff) ──────────────

interface Anchors {
  bg: string;
  surface: string;
  divider: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string; // f-700
  accentText: string; // f-800 (label on light tint)
  inkSolid: string; // f-950 (buttons, nav, active pills)
  hero: string; // f-900 / --color-hero
  tint: string; // f-100 / m-100
  onHero: string; // m-200 (bright accent on hero)
}

type Modes = { light: Anchors; dark: Anchors };

const PRESETS: Record<Exclude<PaletteId, 'custom'>, Modes> = {
  ink: {
    light: {
      bg: '#eef1f7', surface: '#ffffff', divider: '#e2e7f1',
      text: '#0f1a33', textMuted: '#4a5570', textFaint: '#8b93a8',
      accent: '#2f5fe0', accentText: '#2952c8', inkSolid: '#101d3d',
      hero: '#14264f', tint: '#e7edfc', onHero: '#c9d9ff',
    },
    dark: {
      bg: '#0a1122', surface: '#141d33', divider: '#2a3350',
      text: '#eaf0ff', textMuted: '#9aa6c4', textFaint: '#63718f',
      accent: '#5b8def', accentText: '#8fb2ff', inkSolid: '#141d33',
      hero: '#152a57', tint: '#1b2744', onHero: '#8fb2ff',
    },
  },
  graphite: {
    light: {
      bg: '#eef1f4', surface: '#ffffff', divider: '#e1e6ec',
      text: '#1b2330', textMuted: '#54606f', textFaint: '#929bab',
      accent: '#3d5a80', accentText: '#33475f', inkSolid: '#1b2431',
      hero: '#1b2431', tint: '#e9edf2', onHero: '#d3ddea',
    },
    dark: {
      bg: '#0e1319', surface: '#19212c', divider: '#2b3644',
      text: '#eef1f5', textMuted: '#9aa5b4', textFaint: '#616c7c',
      accent: '#6d89ac', accentText: '#a7bad3', inkSolid: '#19212c',
      hero: '#1b2431', tint: '#212c3a', onHero: '#a7bad3',
    },
  },
  plum: {
    light: {
      bg: '#f3f0f8', surface: '#ffffff', divider: '#e7e0f1',
      text: '#241a37', textMuted: '#5b5070', textFaint: '#968aa8',
      accent: '#6d47d9', accentText: '#5a34c2', inkSolid: '#2a1f45',
      hero: '#2a1f45', tint: '#efe9fb', onHero: '#d9c9ff',
    },
    dark: {
      bg: '#140f1f', surface: '#1f1830', divider: '#352a52',
      text: '#f0eaff', textMuted: '#a99cc0', textFaint: '#6d6088',
      accent: '#8b6ae6', accentText: '#b39bf3', inkSolid: '#1f1830',
      hero: '#2a1f45', tint: '#2a2140', onHero: '#b39bf3',
    },
  },
};

// ─── Colour math ─────────────────────────────────────────────────────────────

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function parseHex(hex: string): Rgb {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return { r: 47, g: 95, b: 224 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** "r g b" — the space-separated channel form Tailwind's alpha syntax expects. */
function channels(rgb: Rgb): string {
  return `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue = (p: number, q: number, tRaw: number): number => {
    let t = tRaw;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

function withL(rgb: Rgb, l: number, sScale = 1): Rgb {
  const hsl = rgbToHsl(rgb);
  return hslToRgb(hsl.h, clamp(hsl.s * sScale, 0, 1), clamp(l, 0, 1));
}

/** Build the accent-derived anchors for a user-chosen custom accent. */
function customAnchors(accentHex: string, dark: boolean): Anchors {
  const accent = parseHex(accentHex);
  const neutral = PRESETS.ink[dark ? 'dark' : 'light'];
  if (dark) {
    return {
      bg: neutral.bg, surface: neutral.surface, divider: neutral.divider,
      text: neutral.text, textMuted: neutral.textMuted, textFaint: neutral.textFaint,
      accent: channelsToHex(withL(accent, 0.66)),
      accentText: channelsToHex(withL(accent, 0.78)),
      inkSolid: neutral.inkSolid,
      hero: channelsToHex(withL(accent, 0.22, 0.9)),
      tint: channelsToHex(withL(accent, 0.2, 0.55)),
      onHero: channelsToHex(withL(accent, 0.74)),
    };
  }
  return {
    bg: neutral.bg, surface: neutral.surface, divider: neutral.divider,
    text: neutral.text, textMuted: neutral.textMuted, textFaint: neutral.textFaint,
    accent: accentHex,
    accentText: channelsToHex(withL(accent, Math.max(0.34, rgbToHsl(accent).l - 0.08))),
    inkSolid: channelsToHex(withL(accent, 0.16, 0.6)),
    hero: channelsToHex(withL(accent, 0.21, 0.72)),
    tint: channelsToHex(withL(accent, 0.94, 0.85)),
    onHero: channelsToHex(withL(accent, 0.78)),
  };
}

function channelsToHex(rgb: Rgb): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export interface ResolvedTheme {
  vars: Record<string, string>;
  dark: boolean;
  /** hexes handy for Recharts (which can't read CSS vars). */
  chart: {
    accent: string;
    text: string;
    grid: string;
    good: string;
    bad: string;
    warning: string;
    ramp: string[];
  };
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isDarkMode(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return prefersDark();
}

export function resolveTheme(config: ThemeConfig): ResolvedTheme {
  const dark = isDarkMode(config.mode);
  const a =
    config.paletteId === 'custom'
      ? customAnchors(config.customAccent, dark)
      : PRESETS[config.paletteId][dark ? 'dark' : 'light'];

  const accent = parseHex(a.accent);
  const tint = parseHex(a.tint);
  const bg = parseHex(a.bg);

  // Ramp f-200..f-600 interpolates tint → accent so mid shades stay coherent.
  const f = {
    50: mix(tint, bg, dark ? 0.3 : 0.4),
    100: tint,
    200: mix(tint, accent, 0.22),
    300: mix(tint, accent, 0.42),
    400: mix(tint, accent, 0.6),
    500: mix(tint, accent, 0.78),
    600: mix(tint, accent, 0.9),
    700: accent,
    800: parseHex(a.accentText),
    900: parseHex(a.hero),
    950: parseHex(a.inkSolid),
  };

  const good = dark ? '#34d399' : '#12925a';
  const bad = dark ? '#f87171' : '#dc2626';
  const warning = dark ? '#f0a35a' : '#e0842f';

  // Insights pie ramp: accent → tint, 6 stops.
  const ramp = [
    channelsToHex(parseHex(a.hero)),
    channelsToHex(accent),
    channelsToHex(mix(accent, tint, 0.35)),
    channelsToHex(mix(accent, tint, 0.55)),
    channelsToHex(mix(accent, tint, 0.75)),
    channelsToHex(mix(accent, tint, 0.9)),
  ];

  const vars: Record<string, string> = {
    '--color-paper': channels(bg),
    '--color-surface': channels(parseHex(a.surface)),
    '--color-divider': channels(parseHex(a.divider)),
    '--color-hero': channels(parseHex(a.hero)),
    '--color-ink': channels(parseHex(a.text)),
    '--color-ink-muted': channels(parseHex(a.textMuted)),
    '--color-ink-subtle': channels(parseHex(a.textFaint)),
    '--f-50': channels(f[50]),
    '--f-100': channels(f[100]),
    '--f-200': channels(f[200]),
    '--f-300': channels(f[300]),
    '--f-400': channels(f[400]),
    '--f-500': channels(f[500]),
    '--f-600': channels(f[600]),
    '--f-700': channels(f[700]),
    '--f-800': channels(f[800]),
    '--f-900': channels(f[900]),
    '--f-950': channels(f[950]),
    '--m-50': channels(mix(tint, bg, 0.35)),
    '--m-100': channels(tint),
    '--m-200': channels(parseHex(a.onHero)),
    '--font-app': FONT_STACKS[config.fontId]?.stack ?? FONT_STACKS.inter.stack,
  };

  return {
    vars,
    dark,
    chart: {
      accent: channelsToHex(accent),
      text: a.textMuted,
      grid: a.divider,
      good,
      bad,
      warning,
      ramp,
    },
  };
}

export function applyTheme(config: ThemeConfig): ResolvedTheme {
  const resolved = resolveTheme(config);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(resolved.vars)) {
      root.style.setProperty(key, value);
    }
    root.classList.toggle('dark', resolved.dark);
    root.classList.toggle('light', !resolved.dark);
    root.style.colorScheme = resolved.dark ? 'dark' : 'light';
  }
  return resolved;
}
