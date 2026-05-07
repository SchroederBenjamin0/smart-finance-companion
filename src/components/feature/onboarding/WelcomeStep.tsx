interface Props {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 text-6xl" aria-hidden="true">
          💰
        </div>
        <h1 className="text-3xl font-bold text-ink">
          Smart Finance Companion
        </h1>
        <p className="mt-3 max-w-xs text-base text-ink-muted">
          Deine private Finanz-App für ein besseres Geld-Bewusstsein.
        </p>
        <p className="mt-2 max-w-xs text-sm text-ink-subtle">
          Alle Daten bleiben auf deinem Gerät.
        </p>
      </div>
      <button className="btn-primary w-full" onClick={onNext}>
        Jetzt einrichten
      </button>
    </div>
  );
}
