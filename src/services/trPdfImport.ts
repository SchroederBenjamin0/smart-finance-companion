import { debug } from '@/lib/debug';
import { tryAsync, type Result } from '@/lib/result';
import { tickerFromIsin } from './yahoo';
import { findByIsin } from '@/data/tr-universe';

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
    debug('[TR-PDF] extracted lines', lines);
    debug('[TR-PDF] joined text', lines.join(' | '));
    const result = parseLines(lines);
    debug('[TR-PDF] parsed result', result);
    return result;
  });
}

interface LineItem {
  y: number;
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
  if ((n.match(/\./g) ?? []).length > 1) return null;
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
 * Treat each "<num> Stk." occurrence as a row boundary. In the real TR
 * PDF the row visually reads:
 *
 *   <shares> Stk.  <name>  <price>  <value>
 *                  ISIN: <isin>  <date>
 *
 * — so price + value sit BEFORE the ISIN (same visual row), not after.
 * Per row:
 *   1. Body = text between this Stk. and the next Stk. (or end).
 *   2. ISIN = first ISIN-shaped token in the body.
 *   3. Price + value = first two non-date numbers BEFORE the ISIN.
 *   4. Name = body up to the ISIN, with numbers and headers stripped.
 */
export function parseHoldings(rawText: string): ParsedHolding[] {
  const text = rawText
    .replace(/[   ]/g, ' ') // non-breaking / narrow spaces
    .replace(/[  ]/g, ' ') // thin / hair spaces
    .replace(/[\r\n]+/g, ' \n ')
    .replace(/[ \t]+/g, ' ');

  const stkPattern = /(\d+(?:[.,]\s*\d+)*)\s*Stk\.?\b/gi;
  interface StkHit {
    sharesText: string;
    start: number;
    end: number;
  }
  const stkHits: StkHit[] = [];
  for (const m of text.matchAll(stkPattern)) {
    const sharesText = m[1] ?? '';
    if (parseGermanNumber(sharesText) === null) continue;
    stkHits.push({
      sharesText,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0]!.length,
    });
  }

  const isinPattern = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
  const pureNumberToken = /^-?\d[\d.,]*$/;
  const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;

  const holdings: ParsedHolding[] = [];
  for (let i = 0; i < stkHits.length; i++) {
    const hit = stkHits[i]!;
    const bodyStart = hit.end;
    const bodyEnd =
      i + 1 < stkHits.length ? stkHits[i + 1]!.start : text.length;
    const body = text.slice(bodyStart, bodyEnd);

    const isinMatch = body.match(isinPattern);
    if (!isinMatch) continue;
    const isin = isinMatch[1]!;
    const isinIdx = isinMatch.index ?? 0;

    const shares = parseGermanNumber(hit.sharesText) ?? 0;

    // Walk the body token-by-token (whitespace-delimited). A token only
    // counts as a number if the ENTIRE token is numeric — that way
    // "NASDAQ100" stays one non-numeric token and we don't accidentally
    // treat "100" as a value. Works for both TR PDF layouts (price+value
    // either before the ISIN or after it on separate lines).
    const tokens = body.split(/\s+/).filter(Boolean);
    const numbers: number[] = [];
    for (const tok of tokens) {
      if (datePattern.test(tok)) continue;
      if (!pureNumberToken.test(tok)) continue;
      const n = parseGermanNumber(tok);
      if (n === null) continue;
      numbers.push(n);
      if (numbers.length >= 2) break;
    }
    const price = numbers[0] ?? 0;
    const value = numbers[1] ?? 0;

    const whitelisted = findByIsin(isin);
    const nameRaw = body.slice(0, isinIdx);
    const parsedName = cleanName(stripNumbers(nameRaw));
    // Prefer the canonical TR-universe displayName so the UI matches
    // exactly what the user sees inside Trade Republic.
    const name = whitelisted?.displayName || parsedName;

    const isEtf =
      whitelisted?.type === 'etf' ||
      /\bETF\b|\(Acc\)|UCITS|MSCI|S&P|Nasdaq|DAX/i.test(parsedName) ||
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

function stripNumbers(s: string): string {
  return s.replace(/\d[\d.,]*\d|\d/g, ' ');
}

function cleanName(raw: string): string {
  return raw
    .replace(/[\s\n]+/g, ' ')
    .replace(/\bWERTPAPIERBEZEICHNUNG\b/gi, '')
    .replace(/\bKURS PRO ST(Ü|UE)CK\b/gi, '')
    .replace(/\bKURSWERT IN EUR\b/gi, '')
    .replace(/\bSTK\.\s*\/\s*NOMINALE\b/gi, '')
    .replace(/^\s*ISIN:?\s*/i, '')
    .replace(/\s*ISIN:?\s*$/i, '')
    .replace(/^\s*\.\s*/, '')
    .trim();
}
