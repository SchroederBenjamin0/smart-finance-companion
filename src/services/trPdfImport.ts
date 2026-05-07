import { tryAsync, type Result } from '@/lib/result';
import { tickerFromIsin } from './yahoo';

export interface ParsedHolding {
  isin: string;
  ticker: string;
  name: string;
  shares: number;
  pricePerShare: number;
  currentValue: number;
  /** Best-guess: 'etf' if name contains ETF marker, else 'stock'. */
  assetType: 'etf' | 'stock';
}

export interface TrParseResult {
  date: string;
  brokerage: number;
  cash: number;
  total: number;
  holdings: ParsedHolding[];
}

/**
 * Lazy-loads pdfjs-dist and extracts holdings from a Trade Republic
 * "Vermögensübersicht" (asset overview) PDF.
 */
export async function parseTrPortfolioPdf(
  file: File,
): Promise<Result<TrParseResult>> {
  return tryAsync(async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const workerUrl = (
      await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    const lines = await extractLines(pdf);
    if (typeof window !== 'undefined') {
      console.debug('[TR-PDF] extracted lines', lines);
      console.debug('[TR-PDF] joined text', lines.join(' | '));
    }
    const result = parseLines(lines);
    if (typeof window !== 'undefined') {
      console.debug('[TR-PDF] parsed result', result);
    }
    return result;
  });
}

interface LineItem {
  /** y-coordinate (decreasing top-to-bottom in PDF coordinate space). */
  y: number;
  /** x-coordinate (left-to-right). */
  x: number;
  text: string;
}

async function extractLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
): Promise<string[]> {
  const allItems: LineItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of content.items as any[]) {
      const str: string = item.str ?? '';
      const t: number[] = item.transform ?? [];
      const x = t[4] ?? 0;
      const y = t[5] ?? 0;
      if (str.trim().length === 0) continue;
      allItems.push({ x, y: -y, text: str });
    }
  }

  // Group by y (within tolerance), then sort within each row by x.
  allItems.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: string[] = [];
  let currentY: number | null = null;
  let buffer: LineItem[] = [];
  for (const item of allItems) {
    if (currentY === null || Math.abs(item.y - currentY) < 4) {
      currentY = currentY ?? item.y;
      buffer.push(item);
    } else {
      lines.push(flushLine(buffer));
      buffer = [item];
      currentY = item.y;
    }
  }
  if (buffer.length > 0) lines.push(flushLine(buffer));
  return lines;
}

function flushLine(buf: LineItem[]): string {
  buf.sort((a, b) => a.x - b.x);
  return buf
    .map((b) => b.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseGermanNumber(s: string): number | null {
  const cleaned = s.trim().replace(/\s+/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let n: string;
  if (lastComma === -1 && lastDot === -1) n = cleaned;
  else if (lastComma > lastDot) n = cleaned.replace(/\./g, '').replace(',', '.');
  else n = cleaned.replace(/,/g, '');
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

export function parseLines(lines: string[]): TrParseResult {
  const allText = lines.join(' \n ').replace(/[ \t]+/g, ' ');

  const dateMatch = allText.match(/zum\s+(\d{2}\.\d{2}\.\d{4})/);
  const date = dateMatch?.[1] ?? new Date().toLocaleDateString('de-DE');

  let brokerage = 0;
  let cash = 0;
  let total = 0;
  const brokerageMatch = allText.match(/Brokerage\s+([\d.,]+)/);
  const cashMatch = allText.match(/Cash\s+([\d.,]+)/);
  const totalMatch = allText.match(/GESAMT\s+([\d.,]+)\s*EUR/);
  if (brokerageMatch?.[1]) brokerage = parseGermanNumber(brokerageMatch[1]) ?? 0;
  if (cashMatch?.[1]) cash = parseGermanNumber(cashMatch[1]) ?? 0;
  if (totalMatch?.[1]) total = parseGermanNumber(totalMatch[1]) ?? 0;

  const holdings = parseHoldings(allText);
  return { date, brokerage, cash, total, holdings };
}

/**
 * Find each holding row. Strategy:
 *   1. Normalize the joined text (collapse whitespace, normalize ISIN labels).
 *   2. Find every ISIN occurrence.
 *   3. For each ISIN, look BACKWARDS for "<shares> Stk. <name>" and
 *      FORWARDS for the next two numbers (price, value), skipping the
 *      date if present.
 * This is far more tolerant of PDF layout variation than a single
 * monolithic regex.
 */
export function parseHoldings(rawText: string): ParsedHolding[] {
  const text = rawText
    .replace(/ /g, ' ') // non-breaking spaces
    .replace(/ /g, ' ') // thin spaces
    .replace(/[\r\n]+/g, ' \n ')
    .replace(/[ \t]+/g, ' ');

  const isinRe = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/g;
  const isinHits: { isin: string; idx: number }[] = [];
  for (const m of text.matchAll(isinRe)) {
    isinHits.push({ isin: m[1]!, idx: m.index ?? 0 });
  }

  const holdings: ParsedHolding[] = [];
  for (let i = 0; i < isinHits.length; i++) {
    const { isin, idx } = isinHits[i]!;
    const prevEnd =
      i === 0 ? 0 : isinHits[i - 1]!.idx + isinHits[i - 1]!.isin.length;
    const nextStart =
      i + 1 < isinHits.length ? isinHits[i + 1]!.idx : text.length;

    const before = text.slice(prevEnd, idx);
    const after = text.slice(idx + isin.length, nextStart);

    // Backward: take the LAST valid "<number> Stk." in the segment.
    // Allow optional whitespace after a separator inside the number
    // (handles pdfjs kerning splits like "0, 525373"). Skip date-shaped
    // false matches like "07.05.2026" via parseGermanNumber returning null.
    const sharesPattern = /(\d+(?:[.,]\s*\d+)*)\s*Stk\.?\b/gi;
    let shares = 0;
    let sharesEndIdx = -1;
    for (const sm of before.matchAll(sharesPattern)) {
      const n = parseGermanNumber(sm[1] ?? '');
      if (n === null) continue;
      shares = n;
      sharesEndIdx = (sm.index ?? 0) + sm[0]!.length;
    }
    const nameRaw =
      sharesEndIdx >= 0 ? before.slice(sharesEndIdx) : before;
    const name = cleanName(nameRaw);

    // Forward: first two non-date numeric tokens.
    const numberRe = /\d[\d.,]*\d|\d/g;
    const numbers: number[] = [];
    for (const numMatch of after.matchAll(numberRe)) {
      const raw = numMatch[0] ?? '';
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw.trim())) continue;
      const n = parseGermanNumber(raw);
      if (n === null) continue;
      numbers.push(n);
      if (numbers.length >= 2) break;
    }
    const price = numbers[0] ?? 0;
    const value = numbers[1] ?? 0;

    const isEtf =
      /\bETF\b|\(Acc\)|UCITS|MSCI|S&P|Nasdaq|DAX/i.test(name) ||
      isin.startsWith('IE') ||
      isin.startsWith('LU');

    holdings.push({
      isin,
      ticker: tickerFromIsin(isin) ?? '',
      name,
      shares,
      pricePerShare: price,
      currentValue: value,
      assetType: isEtf ? 'etf' : 'stock',
    });
  }

  return holdings;
}

function cleanName(raw: string): string {
  return raw
    .replace(/[\s\n]+/g, ' ')
    .replace(/\bWERTPAPIERBEZEICHNUNG\b/gi, '')
    .replace(/\bKURS PRO STÜCK\b/gi, '')
    .replace(/\bKURSWERT IN EUR\b/gi, '')
    .replace(/\bSTK\.\s*\/\s*NOMINALE\b/gi, '')
    .replace(/^\s*ISIN:?\s*/i, '')
    .replace(/\s*ISIN:?\s*$/i, '')
    .trim();
}
