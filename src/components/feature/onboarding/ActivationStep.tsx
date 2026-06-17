import { CheckCircle2 } from 'lucide-react';

interface Props {
  isInstalled: boolean;
  onFinish: () => void;
  onBack: () => void;
}

export function ActivationStep({ isInstalled, onFinish, onBack }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-semibold">Aktivierung</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Damit Push-Notifications und Offline-Modus funktionieren, füge die
          App zum Home-Bildschirm hinzu.
        </p>

        {isInstalled ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-chip bg-forest-100 px-4 py-3 text-sm text-forest-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            App läuft im Standalone-Modus. Du bist bereit.
          </div>
        ) : (
          <ol className="mt-4 space-y-3 text-sm">
            <li className="rounded-chip border border-forest-950/10 px-4 py-3">
              <span className="mr-2 font-bold">1.</span>
              Tippe auf den{' '}
              <strong>Share-Button</strong> in Safari
              (das Quadrat mit Pfeil nach oben).
            </li>
            <li className="rounded-chip border border-forest-950/10 px-4 py-3">
              <span className="mr-2 font-bold">2.</span>
              Wähle „<strong>Zum Home-Bildschirm</strong>".
            </li>
            <li className="rounded-chip border border-forest-950/10 px-4 py-3">
              <span className="mr-2 font-bold">3.</span>
              Schließe Safari und öffne die App über das neue Icon.
            </li>
          </ol>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button className="btn-secondary flex-1" onClick={onBack}>
          Zurück
        </button>
        <button className="btn-primary flex-1" onClick={onFinish}>
          App starten
        </button>
      </div>
    </div>
  );
}
