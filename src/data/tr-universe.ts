/**
 * Whitelist of instruments the user can actually trade in Trade Republic.
 * The advisor LLM is constrained to pick exclusively from this list — any
 * recommendation outside it is discarded (with a single retry on a hint).
 *
 * Keep `isin` as the stable identity. `tickerYahoo` is used for price/news
 * lookups, `displayName` is what appears in the UI (matches the wording
 * Trade Republic shows so the user can copy-paste search).
 *
 * To trim or extend: simply edit this file. The advisor and AdvisorSheet
 * both read from this single source of truth.
 */
export type TrAssetType = 'etf' | 'stock';

export interface TrInstrument {
  isin: string;
  tickerYahoo: string;
  displayName: string;
  type: TrAssetType;
  sector?: string;
  /** One-line profile shown in the expandable info-panel per recommendation. */
  description: string;
}

export const TR_UNIVERSE: TrInstrument[] = [
  // ---- Broad-market ETFs ----
  {
    isin: 'IE00B4L5Y983',
    tickerYahoo: 'IWDA.AS',
    displayName: 'iShares Core MSCI World UCITS ETF USD (Acc)',
    type: 'etf',
    sector: 'Global Equity',
    description:
      'Über 1.500 Industrieland-Aktien, USD-thesaurierend. Standard-Welt-ETF für den langfristigen Buy-and-Hold-Anker.',
  },
  {
    isin: 'IE00BK5BQT80',
    tickerYahoo: 'VWCE.DE',
    displayName: 'Vanguard FTSE All-World UCITS ETF (Acc)',
    type: 'etf',
    sector: 'Global Equity',
    description:
      'Welt + Schwellenländer in einem Produkt (~3.700 Aktien), thesaurierend. Alternative zu MSCI-World+EM-Kombination.',
  },
  {
    isin: 'IE00BKM4GZ66',
    tickerYahoo: 'EIMI.DE',
    displayName: 'iShares Core MSCI EM IMI UCITS ETF',
    type: 'etf',
    sector: 'Emerging Markets',
    description:
      'Breite Schwellenländer-Abdeckung inkl. Small Caps. Übliche EM-Ergänzung zum MSCI-World.',
  },
  {
    isin: 'IE00B5BMR087',
    tickerYahoo: 'SXR8.DE',
    displayName: 'iShares Core S&P 500 UCITS ETF',
    type: 'etf',
    sector: 'US Equity',
    description:
      '500 größte US-Unternehmen, thesaurierend. Eng korreliert mit MSCI-World-US-Anteil; pure US-Wette.',
  },
  {
    isin: 'IE00B53SZB19',
    tickerYahoo: 'CSNDX.DE',
    displayName: 'iShares Nasdaq 100 UCITS ETF',
    type: 'etf',
    sector: 'US Tech',
    description:
      '100 größte Nasdaq-Werte, stark Tech-lastig. Übergewichtungs-Building-Block, kein Basisinvestment.',
  },
  {
    isin: 'DE0002635307',
    tickerYahoo: 'EXSA.DE',
    displayName: 'iShares STOXX Europe 600 UCITS ETF (DE)',
    type: 'etf',
    sector: 'European Equity',
    description:
      'Breite Europa-Abdeckung (600 Werte, 17 Länder), ausschüttend. Heimatmarkt-Bias-Korrektur.',
  },
  {
    isin: 'IE00B4WXJJ64',
    tickerYahoo: 'IBCH.DE',
    displayName: 'iShares Core Euro Government Bond UCITS ETF',
    type: 'etf',
    sector: 'Euro Government Bonds',
    description:
      'Euro-Staatsanleihen aus dem Euroraum. Schwankungsdämpfer für gemischte Portfolios.',
  },
  {
    isin: 'IE00B4ND3602',
    tickerYahoo: 'IGLN.L',
    displayName: 'iShares Physical Gold ETC',
    type: 'etf',
    sector: 'Commodity / Gold',
    description:
      'Physisch besichertes Gold-ETC, EUR-handelbar. Inflationsabsicherung in Maßen.',
  },
  {
    isin: 'IE00B3RBWM25',
    tickerYahoo: 'VWRL.DE',
    displayName: 'Vanguard FTSE All-World UCITS ETF (Dist)',
    type: 'etf',
    sector: 'Global Equity',
    description:
      'Wie VWCE, aber ausschüttend. Sinnvoll wenn du Dividenden im Sparerpauschbetrag nutzt.',
  },
  {
    isin: 'IE00BJ0KDQ92',
    tickerYahoo: 'XDWD.DE',
    displayName: 'Xtrackers MSCI World UCITS ETF 1C',
    type: 'etf',
    sector: 'Global Equity',
    description:
      'Alternative zum iShares MSCI World, etwas niedrigere TER. Funktional sehr ähnlich.',
  },
  // ---- Top-tier individual equities (TR-listed, EUR) ----
  {
    isin: 'US0378331005',
    tickerYahoo: 'AAPL.DE',
    displayName: 'Apple Inc.',
    type: 'stock',
    sector: 'Consumer Tech',
    description:
      'Hardware + Services + Marken-Ökosystem. Hohe Buybacks, stabile Margen, China-Exposure.',
  },
  {
    isin: 'US5949181045',
    tickerYahoo: 'MSF.DE',
    displayName: 'Microsoft Corporation',
    type: 'stock',
    sector: 'Software / Cloud',
    description:
      'Azure Cloud + Office + Copilot AI. Größter Enterprise-Software-Vendor weltweit.',
  },
  {
    isin: 'US67066G1040',
    tickerYahoo: 'NVD.DE',
    displayName: 'NVIDIA Corporation',
    type: 'stock',
    sector: 'Semiconductors / AI',
    description:
      'Marktführer für GPUs und KI-Beschleuniger. Sehr zyklisch, hohe Bewertung.',
  },
  {
    isin: 'NL0010273215',
    tickerYahoo: 'ASME.DE',
    displayName: 'ASML Holding NV',
    type: 'stock',
    sector: 'Semiconductors / Equipment',
    description:
      'Monopolist für EUV-Lithografie-Maschinen. Schlüssel der globalen Chipfertigung.',
  },
  {
    isin: 'US4781601046',
    tickerYahoo: 'JNJ.DE',
    displayName: 'Johnson & Johnson',
    type: 'stock',
    sector: 'Healthcare / Pharma',
    description:
      'Pharma + MedTech. Defensiv, langjährige Dividenden-Aristokratie.',
  },
  {
    isin: 'DE0007164600',
    tickerYahoo: 'SAP.DE',
    displayName: 'SAP SE',
    type: 'stock',
    sector: 'Enterprise Software',
    description:
      'Europas größtes Software-Haus. ERP-Cloud-Migration treibt den Investment-Case.',
  },
];

const BY_ISIN: Map<string, TrInstrument> = new Map(
  TR_UNIVERSE.map((i) => [i.isin.toUpperCase(), i]),
);

export function findByIsin(isin: string): TrInstrument | null {
  if (!isin) return null;
  return BY_ISIN.get(isin.toUpperCase()) ?? null;
}

export function isAllowedIsin(isin: string): boolean {
  return BY_ISIN.has(isin.toUpperCase());
}
