// Web Vibration API wrapper.
//
// Works on Android (Chrome, Firefox) and Android-PWAs out of the box.
// iOS Safari / iOS-PWAs do NOT support this API — all calls are silent
// no-ops there. There is no current way to trigger real haptic feedback
// from a web context on iOS short of a native wrapper (Capacitor etc).
//
// For visual fallback on iOS, components should also rely on `active:`
// Tailwind classes (scale, color-flash) which give a tactile-ish feel.

type HapticIntensity = 'light' | 'medium' | 'heavy';

const DURATION_MS: Record<HapticIntensity, number> = {
  light: 10,
  medium: 20,
  heavy: 35,
};

export function haptic(intensity: HapticIntensity = 'light'): void {
  if (typeof navigator === 'undefined') return;
  const fn = navigator.vibrate?.bind(navigator);
  if (!fn) return;
  fn(DURATION_MS[intensity]);
}

export function hapticPattern(pattern: number[]): void {
  if (typeof navigator === 'undefined') return;
  const fn = navigator.vibrate?.bind(navigator);
  if (!fn) return;
  fn(pattern);
}

// Common "success" pattern: short pulse, brief pause, short pulse.
export function hapticSuccess(): void {
  hapticPattern([10, 30, 20]);
}

// Common "error" pattern: longer pulse.
export function hapticError(): void {
  hapticPattern([40]);
}
