import { useThemeStore } from '@/stores/theme';

export interface ChartColors {
  primary: string; // Main series line
  warning: string; // Yellow reference line
  danger: string; // Red reference line
  reference: string; // Dashed neutral line (contribution baseline)
  text: string; // Axis/tooltip text
  grid: string; // Grid lines
  /** Categorical ramp for multi-segment charts (Insights donut / bars). */
  ramp: string[];
}

/**
 * Recharts-compatible colour tokens derived from the active theme.
 * Recharts SVGs use inline stroke/fill props that can't read CSS variables,
 * so we pull the resolved hexes from the theme store — this re-renders when
 * the palette, custom accent, or light/dark mode changes.
 */
export function useChartColors(): ChartColors {
  const chart = useThemeStore((s) => s.resolved.chart);
  return {
    primary: chart.accent,
    warning: chart.warning,
    danger: chart.bad,
    reference: chart.grid,
    text: chart.text,
    grid: chart.grid,
    ramp: chart.ramp,
  };
}
