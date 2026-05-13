import { useEffect, useState } from 'react';

export interface ChartColors {
  primary: string;       // Main series line
  warning: string;       // Yellow reference line
  danger: string;        // Red reference line
  reference: string;     // Dashed neutral line (contribution baseline)
  text: string;          // Axis/tooltip text
  grid: string;          // Grid lines
}

const LIGHT: ChartColors = {
  primary: '#0a2e1f',
  warning: '#f59e0b',
  danger: '#dc2626',
  reference: '#94a3b8',
  text: '#3d5a4d',
  grid: '#e4e4e7',
};

const DARK: ChartColors = {
  primary: '#a7f3d0',       // emerald-200 — visible on dark surface
  warning: '#fbbf24',       // amber-400
  danger: '#f87171',        // red-400
  reference: '#64748b',     // slate-500
  text: '#9ca3af',          // gray-400
  grid: '#374151',          // gray-700
};

/**
 * Returns Recharts-compatible color tokens that respect prefers-color-scheme.
 * Recharts SVGs use inline stroke/fill props that don't read CSS variables —
 * this hook re-renders on system theme change to switch the palette.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? DARK
      : LIGHT,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setColors(e.matches ? DARK : LIGHT);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return colors;
}
