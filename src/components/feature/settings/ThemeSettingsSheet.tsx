import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { useThemeStore } from '@/stores/theme';
import {
  FONT_STACKS,
  PALETTE_LABELS,
  type FontId,
  type PaletteId,
  type ThemeMode,
} from '@/lib/theme';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MODES: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'System', Icon: Monitor },
  { id: 'light', label: 'Hell', Icon: Sun },
  { id: 'dark', label: 'Dunkel', Icon: Moon },
];

const PRESET_SWATCH: Record<Exclude<PaletteId, 'custom'>, string> = {
  ink: '#2f5fe0',
  graphite: '#3d5a80',
  plum: '#6d47d9',
};

// Curated one-tap accent choices for the custom palette.
const ACCENT_SWATCHES = [
  '#2f5fe0', '#0d9488', '#12925a', '#d97706',
  '#e11d48', '#a21caf', '#6d47d9', '#475569',
];

const FONT_ORDER: FontId[] = ['inter', 'system', 'rounded', 'serif', 'mono'];

export function ThemeSettingsSheet({ open, onOpenChange }: Props) {
  const config = useThemeStore((s) => s.config);
  const setMode = useThemeStore((s) => s.setMode);
  const setPalette = useThemeStore((s) => s.setPalette);
  const setCustomAccent = useThemeStore((s) => s.setCustomAccent);
  const setFont = useThemeStore((s) => s.setFont);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Darstellung">
      <div className="space-y-6 pb-2">
        {/* Mode */}
        <section>
          <SectionLabel>Modus</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => {
              const active = config.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void setMode(m.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-control border px-3 py-3 text-meta font-semibold transition ${
                    active
                      ? 'border-forest-700 bg-forest-100 text-forest-800'
                      : 'border-divider bg-surface text-ink-muted'
                  }`}
                >
                  <m.Icon className="h-5 w-5" strokeWidth={2.25} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Palette presets */}
        <section>
          <SectionLabel>Farbschema</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PALETTE_LABELS) as Exclude<PaletteId, 'custom'>[]).map(
              (id) => {
                const active = config.paletteId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => void setPalette(id)}
                    className={`relative flex items-center gap-2 rounded-control border px-3 py-3 text-label font-semibold transition ${
                      active
                        ? 'border-forest-700 bg-forest-100 text-forest-800'
                        : 'border-divider bg-surface text-ink'
                    }`}
                  >
                    <span
                      className="h-5 w-5 shrink-0 rounded-full"
                      style={{ backgroundColor: PRESET_SWATCH[id] }}
                    />
                    {PALETTE_LABELS[id]}
                  </button>
                );
              },
            )}
          </div>
        </section>

        {/* Custom accent */}
        <section>
          <SectionLabel>Eigene Akzentfarbe</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((hex) => {
              const active =
                config.paletteId === 'custom' &&
                config.customAccent.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Akzent ${hex}`}
                  onClick={() => void setCustomAccent(hex)}
                  className={`grid h-9 w-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-paper transition ${
                    active ? 'ring-ink' : 'ring-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {active && (
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  )}
                </button>
              );
            })}
            <label
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-divider bg-surface text-ink-subtle"
              aria-label="Farbe frei wählen"
              style={
                config.paletteId === 'custom' &&
                !ACCENT_SWATCHES.some(
                  (h) => h.toLowerCase() === config.customAccent.toLowerCase(),
                )
                  ? { backgroundColor: config.customAccent }
                  : undefined
              }
            >
              <span
                className="h-4 w-4 rounded-full"
                style={{
                  background:
                    'conic-gradient(#f43f5e,#f59e0b,#22c55e,#2f5fe0,#a855f7,#f43f5e)',
                }}
              />
              <input
                type="color"
                className="sr-only"
                value={config.customAccent}
                onChange={(e) => void setCustomAccent(e.target.value)}
              />
            </label>
          </div>
          <p className="mt-2 text-caption text-ink-subtle">
            Wähle einen Farbton – Tints, Chips und Diagramme leiten sich
            automatisch daraus ab.
          </p>
        </section>

        {/* Font */}
        <section>
          <SectionLabel>Schrift</SectionLabel>
          <div className="space-y-2">
            {FONT_ORDER.map((id) => {
              const active = config.fontId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void setFont(id)}
                  className={`flex w-full items-center justify-between rounded-control border px-4 py-3 text-left transition ${
                    active
                      ? 'border-forest-700 bg-forest-100'
                      : 'border-divider bg-surface'
                  }`}
                  style={{ fontFamily: FONT_STACKS[id].stack }}
                >
                  <span className="text-body font-semibold text-ink">
                    {FONT_STACKS[id].label}
                  </span>
                  <span className="text-label tabular-nums text-ink-subtle">
                    1.234,56 €
                  </span>
                  {active && (
                    <Check
                      className="ml-2 h-4 w-4 text-forest-700"
                      strokeWidth={3}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-meta font-semibold uppercase tracking-wider text-ink-subtle">
      {children}
    </h3>
  );
}
