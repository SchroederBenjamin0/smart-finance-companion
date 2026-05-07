import { useState } from 'react';
import { probeAnthropicKey } from '@/services/claude';
import { probeMarketauxKey } from '@/services/marketaux';

interface Props {
  anthropicKey: string;
  marketauxKey: string;
  onChange: (patch: { anthropicKey?: string; marketauxKey?: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

type ProbeStatus = 'idle' | 'testing' | 'ok' | 'error';

export function ApiKeysStep({
  anthropicKey,
  marketauxKey,
  onChange,
  onNext,
  onBack,
}: Props) {
  const [status, setStatus] = useState<ProbeStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canTest = anthropicKey.trim().length > 0;

  async function testAndContinue() {
    setStatus('testing');
    setErrorMsg(null);

    const a = await probeAnthropicKey(anthropicKey.trim());
    if (!a.ok) {
      setStatus('error');
      setErrorMsg(`Anthropic-Key ungültig: ${a.error.message}`);
      return;
    }

    if (marketauxKey.trim()) {
      const m = await probeMarketauxKey(marketauxKey.trim());
      if (!m.ok) {
        setStatus('error');
        setErrorMsg(
          `Marketaux-Key ungültig: ${m.error.message}. Du kannst ihn auch leer lassen.`,
        );
        return;
      }
    }

    setStatus('ok');
    onNext();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-2xl font-semibold">API-Keys</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Diese Keys bleiben lokal auf deinem Gerät und werden niemals an
          einen Server gesendet.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="anthropic-key"
              className="text-sm font-medium text-ink"
            >
              Anthropic API Key
            </label>
            <input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="input-field mt-1"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => onChange({ anthropicKey: e.target.value })}
            />
            <p className="mt-1 text-xs text-ink-subtle">
              console.anthropic.com → Settings → API Keys
            </p>
          </div>

          <div>
            <label
              htmlFor="marketaux-key"
              className="text-sm font-medium text-ink"
            >
              Marketaux API Key{' '}
              <span className="text-ink-subtle">(optional)</span>
            </label>
            <input
              id="marketaux-key"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="input-field mt-1"
              placeholder="optional"
              value={marketauxKey}
              onChange={(e) => onChange({ marketauxKey: e.target.value })}
            />
            <p className="mt-1 text-xs text-ink-subtle">
              Free Tier auf marketaux.com — wird für News-Filter genutzt.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorMsg}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-3">
        <button className="btn-secondary flex-1" onClick={onBack}>
          Zurück
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => void testAndContinue()}
          disabled={!canTest || status === 'testing'}
        >
          {status === 'testing' ? 'Teste…' : 'Weiter'}
        </button>
      </div>
    </div>
  );
}
