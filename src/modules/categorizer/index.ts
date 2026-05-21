import { ok, err, type Result } from '@/lib/result';
import type { CategoryRule } from '@/db/types';
import { categoryRulesRepo } from '@/db/repositories/categoryRules';
import { CLAUDE_MODELS, callClaude } from '@/services/claude';
import { HEATS_CATEGORY, isHeatsAmount } from './heatsDetector';

export interface CategorizationInput {
  localId: number;
  date: string;
  counterparty: string;
  description?: string | null;
  amount: number;
}

export interface CategorizationOutput {
  localId: number;
  category: string;
  confidence: number;
  source: 'lookup' | 'llm' | 'fallback';
  warning?: string | null;
}

export const VALID_CATEGORIES = [
  'lebensmittel',
  'restaurants',
  'musik-tools',
  'software-abos',
  'transport',
  'freizeit',
  'nightlife',
  'kleidung',
  'gesundheit',
  'gebühren',
  'tabak',
  'einkommen',
  'transfer',
  'umbuchung',
  'sonstiges',
] as const;

const CATEGORY_SET = new Set<string>(VALID_CATEGORIES);
const BATCH_SIZE = 25;

export async function categorize(
  inputs: CategorizationInput[],
): Promise<Result<CategorizationOutput[]>> {
  if (inputs.length === 0) return ok([]);

  // Stage 0: ensure seeded rules exist.
  await categoryRulesRepo.ensureSeeded();

  const rulesResult = await categoryRulesRepo.findAll();
  if (!rulesResult.ok) return rulesResult;
  const rules = rulesResult.value;

  // Stage 1: heats fast-path + rule lookup.
  const outputs: (CategorizationOutput | null)[] = inputs.map(() => null);
  const unresolvedIdx: number[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const t = inputs[i]!;

    if (t.amount < 0 && isHeatsAmount(t.amount)) {
      outputs[i] = {
        localId: t.localId,
        category: HEATS_CATEGORY,
        confidence: 0.95,
        source: 'lookup',
      };
      continue;
    }

    const hit = matchAgainstRules(t, rules);
    if (hit) {
      outputs[i] = {
        localId: t.localId,
        category: hit.category,
        confidence: 0.95,
        source: 'lookup',
      };
      void categoryRulesRepo.recordHit(hit.id);
    } else {
      unresolvedIdx.push(i);
    }
  }

  // Stage 2: bulk LLM for unresolved.
  if (unresolvedIdx.length > 0) {
    for (let start = 0; start < unresolvedIdx.length; start += BATCH_SIZE) {
      const batch = unresolvedIdx
        .slice(start, start + BATCH_SIZE)
        .map((i) => inputs[i]!);
      const r = await llmCategorize(batch);
      if (r.ok) {
        for (const out of r.value) {
          const idx = inputs.findIndex((t) => t.localId === out.localId);
          if (idx >= 0) outputs[idx] = out;
        }
      }
    }
  }

  // Stage 3: fallback for anything still unresolved.
  for (let i = 0; i < outputs.length; i++) {
    if (outputs[i] === null) {
      const t = inputs[i]!;
      outputs[i] = {
        localId: t.localId,
        category: t.amount > 0 ? 'einkommen' : 'sonstiges',
        confidence: 0.4,
        source: 'fallback',
      };
    }
  }

  return ok(outputs.map((o) => o!));
}

interface RuleHit {
  id: string;
  category: string;
}

function matchAgainstRules(
  t: CategorizationInput,
  rules: CategoryRule[],
): RuleHit | null {
  const haystack = `${t.counterparty} ${t.description ?? ''}`.trim();
  for (const r of rules) {
    if (matchRule(haystack, r)) {
      return { id: r.id, category: r.category };
    }
  }
  return null;
}

function matchRule(text: string, rule: CategoryRule): boolean {
  if (rule.matchType === 'exact') {
    return text.trim().toLowerCase() === rule.counterpartyPattern.toLowerCase();
  }
  try {
    const re = new RegExp(rule.counterpartyPattern, 'i');
    return re.test(text);
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT = `Du bist ein deutschsprachiger Finanz-Categorizer.
Deine Aufgabe: Transaktionsdaten klassifizieren.

Verfügbare Kategorien (genau eine pro Buchung):
- lebensmittel  (Supermärkte, Bäcker, Wochenmarkt, Kioske)
- restaurants   (Restaurants, Lieferdienste, Coffee Shops)
- musik-tools   (Splice, Plugins, Studio-Equipment, DJ-Software)
- software-abos (alle SaaS-Subscriptions außer Music-Tools)
- transport     (Tank, ÖPNV, Bahn, Flüge, Taxi/Uber)
- freizeit      (Kino, Konzerte, Streaming, Games, Hobbies)
- nightlife     (Clubs, Bars, Spätis nach Mitternacht, Türen-/Eintrittsgebühren)
- kleidung      (Mode, Schuhe, Accessoires)
- gesundheit    (Apotheke, Arzt, Sport, Fitness)
- gebühren      (Bankgebühren, Mahnungen, Steuern)
- tabak         (Tabakwaren, Zigaretten, Heats. Wird i.d.R. schon vor dem
                  LLM-Aufruf via Betrag (7,80 € / 15,60 €) markiert; hier
                  nur falls Counterparty eindeutig Tabakladen.)
- einkommen     (positive Buchungen wie Gehalt, Top-up, Refund)
- transfer      (Überweisungen an DRITTE — Miete, Freunde, externe IBANs.
                  Echte Ausgabe, fließt in die Spending-Stats.)
- umbuchung     (Umbuchungen zwischen EIGENEN Konten, z.B. Revolut
                  Personal ↔ Savings Vault, "To Personal Account",
                  "From Savings". KEINE Ausgabe — das Geld bleibt
                  in der eigenen Tasche.)
- sonstiges

Antwort-Format (strikt JSON, kein Markdown-Code-Block):
[
  { "id": 0, "category": "lebensmittel", "confidence": 0.95, "warning": null }
]

Setze warning bei:
- Doppelten Abbuchungen am selben Tag mit gleichem Betrag
- Ungewöhnlich hohen Beträgen (>100€) für lebensmittel/restaurants
- Wiederkehrenden Buchungen die wie Subscriptions aussehen

Antworte nur mit dem JSON-Array, ohne Erklärungen.`;

async function llmCategorize(
  batch: CategorizationInput[],
): Promise<Result<CategorizationOutput[]>> {
  const userMessage = JSON.stringify(
    batch.map((t) => ({
      id: t.localId,
      date: t.date,
      counterparty: t.counterparty,
      amount: t.amount,
      description: t.description ?? null,
    })),
  );

  const r = await callClaude({
    model: CLAUDE_MODELS.SONNET,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  if (!r.ok) return err(r.error);

  const text = r.value.content?.[0]?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return err(new Error(`LLM returned non-JSON: ${e instanceof Error ? e.message : String(e)}`));
  }
  if (!Array.isArray(parsed)) {
    return err(new Error('LLM did not return an array'));
  }

  const outputs: CategorizationOutput[] = [];
  for (const entry of parsed as Array<Record<string, unknown>>) {
    const id = Number(entry['id']);
    const category =
      typeof entry['category'] === 'string' ? entry['category'] : '';
    const confidence =
      typeof entry['confidence'] === 'number' ? entry['confidence'] : 0.5;
    const warning =
      typeof entry['warning'] === 'string' ? entry['warning'] : null;
    if (!Number.isFinite(id)) continue;
    if (!CATEGORY_SET.has(category)) {
      // Coerce unknown categories to "sonstiges" with low confidence.
      outputs.push({
        localId: id,
        category: 'sonstiges',
        confidence: 0.3,
        source: 'llm',
        warning: `Unknown category from LLM: ${category}`,
      });
      continue;
    }
    outputs.push({
      localId: id,
      category,
      confidence: Math.max(0, Math.min(1, confidence)),
      source: 'llm',
      warning,
    });
  }
  return ok(outputs);
}

/**
 * Force re-categorization via LLM for the provided transactions, skipping
 * the rule-lookup stage. Used by the manual "Mit LLM neu prüfen" button.
 */
export async function recategorizeWithLLM(
  inputs: CategorizationInput[],
): Promise<Result<CategorizationOutput[]>> {
  if (inputs.length === 0) return ok([]);

  // Heats short-circuits the LLM call entirely — pure amount-based signal.
  const outputs: (CategorizationOutput | null)[] = inputs.map(() => null);
  const llmIdx: number[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const t = inputs[i]!;
    if (t.amount < 0 && isHeatsAmount(t.amount)) {
      outputs[i] = {
        localId: t.localId,
        category: HEATS_CATEGORY,
        confidence: 0.95,
        source: 'lookup',
      };
      continue;
    }
    llmIdx.push(i);
  }

  for (let start = 0; start < llmIdx.length; start += BATCH_SIZE) {
    const batch = llmIdx
      .slice(start, start + BATCH_SIZE)
      .map((i) => inputs[i]!);
    const r = await llmCategorize(batch);
    if (r.ok) {
      for (const out of r.value) {
        const idx = inputs.findIndex((t) => t.localId === out.localId);
        if (idx >= 0) outputs[idx] = out;
      }
    }
  }

  // Fallback for anything still null.
  for (let i = 0; i < outputs.length; i++) {
    if (outputs[i] === null) {
      const t = inputs[i]!;
      outputs[i] = {
        localId: t.localId,
        category: t.amount > 0 ? 'einkommen' : 'sonstiges',
        confidence: 0.4,
        source: 'fallback',
      };
    }
  }
  return ok(outputs.map((o) => o!));
}

