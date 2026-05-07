import { useToastStore } from '@/stores/toast';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),16px)] z-[100] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-pop-in ${
            t.variant === 'success'
              ? 'bg-emerald-600 text-white'
              : t.variant === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-forest-950 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
