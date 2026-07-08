import { create } from 'zustand';
import { configRepo } from '@/db/repositories/config';
import { ALL_CONFIG_KEYS } from '@/db/types';
import {
  applyTheme,
  DEFAULT_THEME,
  resolveTheme,
  type FontId,
  type PaletteId,
  type ResolvedTheme,
  type ThemeConfig,
  type ThemeMode,
} from '@/lib/theme';

interface ThemeState {
  config: ThemeConfig;
  resolved: ResolvedTheme;
  loaded: boolean;
  load: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  setPalette: (paletteId: PaletteId) => Promise<void>;
  setCustomAccent: (hex: string) => Promise<void>;
  setFont: (fontId: FontId) => Promise<void>;
  /** re-apply on OS light/dark change while in 'system' mode */
  syncSystem: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  config: DEFAULT_THEME,
  resolved: resolveTheme(DEFAULT_THEME),
  loaded: false,
  load: async () => {
    const stored = await configRepo.getJson<Partial<ThemeConfig>>(
      ALL_CONFIG_KEYS.themeOverride,
    );
    const config: ThemeConfig =
      stored.ok && stored.value
        ? { ...DEFAULT_THEME, ...stored.value }
        : DEFAULT_THEME;
    const resolved = applyTheme(config);
    set({ config, resolved, loaded: true });
  },
  setMode: async (mode) => {
    await persist(set, get, { mode });
  },
  setPalette: async (paletteId) => {
    await persist(set, get, { paletteId });
  },
  setCustomAccent: async (customAccent) => {
    await persist(set, get, { paletteId: 'custom', customAccent });
  },
  setFont: async (fontId) => {
    await persist(set, get, { fontId });
  },
  syncSystem: () => {
    if (get().config.mode !== 'system') return;
    const resolved = applyTheme(get().config);
    set({ resolved });
  },
}));

async function persist(
  set: (partial: Partial<ThemeState>) => void,
  get: () => ThemeState,
  patch: Partial<ThemeConfig>,
): Promise<void> {
  const config = { ...get().config, ...patch };
  const resolved = applyTheme(config);
  set({ config, resolved });
  await configRepo.setJson(ALL_CONFIG_KEYS.themeOverride, config);
}
