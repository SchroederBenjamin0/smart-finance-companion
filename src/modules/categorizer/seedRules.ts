import type { CategoryRule, MatchType, RuleSource } from '@/db/types';

export interface SeedRule {
  pattern: string;
  matchType: MatchType;
  category: string;
  createdBy: RuleSource;
}

/**
 * Counterparty regexes that identify a move BETWEEN the user's own
 * accounts (no third party involved). Shared with the migration that
 * re-classifies historical `transfer`-rows to `umbuchung`.
 */
export const INTERNAL_TRANSFER_PATTERNS: string[] = [
  '^(To|From) Instant Access Savings$',
  '^(To|From) Personal Account$',
  '^(To|From) Savings( Vault| Account)?$',
  '^(To|From) (Vault|Pocket|Money Pot|Group Account)\\b',
  '^(Übertrag|Umbuchung) (zu|von) ',
];

export function matchesInternalTransfer(counterparty: string): boolean {
  const text = counterparty.trim();
  for (const p of INTERNAL_TRANSFER_PATTERNS) {
    try {
      if (new RegExp(p, 'i').test(text)) return true;
    } catch {
      // ignore bad regex — pattern would also fail at seed time
    }
  }
  return false;
}

/**
 * Default category rules seeded on first use. Patterns are matched
 * (case-insensitive) against the counterparty / description text.
 */
export const SEED_RULES: SeedRule[] = [
  // Supermärkte
  { pattern: '^(REWE|EDEKA|ALDI|LIDL|KAUFLAND|NETTO|PENNY|DM|ROSSMANN|BUDNI|BUDNIKOWSKY)\\b', matchType: 'regex', category: 'lebensmittel', createdBy: 'system' },
  { pattern: '\\b(BÄCKER|BAECKER|BACKEREI|BACKWAREN|BIO[ -]MARKT|BIOMARKT)\\b', matchType: 'regex', category: 'lebensmittel', createdBy: 'system' },

  // Tank / Transport
  { pattern: '^(SHELL|ARAL|ESSO|TOTAL|JET|HEM|BP|STAR )', matchType: 'regex', category: 'transport', createdBy: 'system' },
  { pattern: '\\b(DB |DEUTSCHE BAHN|HVV|BVG|MVV|RMV|S-BAHN|U-BAHN|UBER|FREE NOW|BOLT|SIXT|DEUTSCHLAND-?TICKET)\\b', matchType: 'regex', category: 'transport', createdBy: 'system' },

  // Software / SaaS
  { pattern: '\\b(LEXWARE|OPENAI|CHATGPT|GITHUB|CLOUDFLARE|VERCEL|HETZNER|JETBRAINS|ADOBE|NOTION|FIGMA|DROPBOX|GOOGLE STORAGE|GOOGLE ONE|MICROSOFT|APPLE\\.COM/BILL)\\b', matchType: 'regex', category: 'software-abos', createdBy: 'system' },

  // Music / DJ tools
  { pattern: '\\b(SPLICE|SOUNDCLOUD|ABLETON|NATIVE INSTRUMENTS|SERATO|SERUM|BEATPORT|TRAKTOR|REKORDBOX)\\b', matchType: 'regex', category: 'musik-tools', createdBy: 'system' },

  // Streaming / Entertainment
  { pattern: '\\b(NETFLIX|SPOTIFY|APPLE MUSIC|YOUTUBE|DISNEY|PRIME VIDEO|HBO|TWITCH|SNAPCHAT)\\b', matchType: 'regex', category: 'freizeit', createdBy: 'system' },

  // Restaurants / Cafés / Delivery
  { pattern: '\\b(STARBUCKS|MCDONALD|BURGER KING|KFC|SUBWAY|VAPIANO|DOMINO|PIZZA|SUSHI|BÄCKER|BACK[- ]?WERK|CAFE|CAFÉ|RESTAURANT|KIOSK)\\b', matchType: 'regex', category: 'restaurants', createdBy: 'system' },
  { pattern: '\\b(LIEFERANDO|UBER EATS|WOLT|FLINK|GORILLAS|PICNIC)\\b', matchType: 'regex', category: 'restaurants', createdBy: 'system' },

  // Nightlife — German clubs, bars, Spätis
  { pattern: '\\b(BERGHAIN|SISYPHOS|KATER BLAU|CIRCLE CLUB|TRESOR|SALON ZUR WILDEN RENATE|WATERGATE|ABOUT BLANK|FABRIC|KESSELHAUS|GRIESSMÜHLE|GRIESSMUEHLE)\\b', matchType: 'regex', category: 'nightlife', createdBy: 'system' },
  { pattern: '(?:^|\\b)(NIGHTCLUB|NACHTCLUB|DISCOTHEK|DISCO |DANCEFLOOR)\\b', matchType: 'regex', category: 'nightlife', createdBy: 'system' },
  { pattern: '\\b(SPAETI|SP[ÄA]TI|SP[ÄA]TKAUF|SPAETKAUF|SPAETSHOP|SP[ÄA]TSHOP)\\b', matchType: 'regex', category: 'nightlife', createdBy: 'system' },

  // Health
  { pattern: '\\b(APOTHEKE|DOC MORRIS|ZUR ROSE|FIT(?:NESS)?|MCFIT|FITX|URBAN SPORTS|SPORTSTUDIO)\\b', matchType: 'regex', category: 'gesundheit', createdBy: 'system' },

  // Clothing
  { pattern: '\\b(ZALANDO|ABOUT YOU|H&M|ZARA|UNIQLO|C&A|ESPRIT|S\\.OLIVER|HUGO BOSS|NIKE|ADIDAS|ASOS|SNIPES|FOOT LOCKER)\\b', matchType: 'regex', category: 'kleidung', createdBy: 'system' },

  // Banking / Fees / Salary
  { pattern: '^(GEHALT|LOHN|SALARY|TOP[- ]?UP)\\b', matchType: 'regex', category: 'einkommen', createdBy: 'system' },
  { pattern: '\\b(MAHNGEB(?:ÜHR|UEHR)|KONTO[- ]?GEB(?:Ü|UE)HR|ÜBERZIEHUNG|UEBERZIEHUNG|FINANZAMT|STEUER)\\b', matchType: 'regex', category: 'gebühren', createdBy: 'system' },

  // Internal own-account moves — money shifted between the user's own
  // Revolut buckets (Personal ↔ Savings Vault, Pockets, Vaults). These
  // appear as negative on the source side and positive on the destination
  // and must NOT be counted as spending. They live in their own
  // `umbuchung` category (≠ `transfer`, which is reserved for outgoing
  // payments to third parties like rent or friends).
  ...INTERNAL_TRANSFER_PATTERNS.map((pattern) => ({
    pattern,
    matchType: 'regex' as const,
    category: 'umbuchung',
    createdBy: 'system' as const,
  })),

  { pattern: '^Top[- ]?up by ', matchType: 'regex', category: 'einkommen', createdBy: 'system' },
];

/**
 * Materialize the seed list into CategoryRule shape (without id/createdAt
 * which are added by the repository layer when persisted).
 */
export type CategoryRuleSeed = Omit<CategoryRule, 'id' | 'createdAt'>;

export function seedRulesAsRecords(): CategoryRuleSeed[] {
  return SEED_RULES.map((s) => ({
    counterpartyPattern: s.pattern,
    matchType: s.matchType,
    category: s.category,
    createdBy: s.createdBy,
    hitCount: 0,
    lastUsed: null,
  }));
}
