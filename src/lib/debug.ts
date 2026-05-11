export function debug(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

export function debugWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}
