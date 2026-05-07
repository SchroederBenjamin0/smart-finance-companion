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
    return parseLines(lines);
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
  // Join with single space; collapse multiple spaces.
  return buf
    .map((b) => b.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ISIN_PATTERN = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;

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

function parseLines(lines: string[]): TrParseResult {
  const allText = lines.join('\n');

  // Date from "VERMÖGENSÜBERSICHT zum DD.MM.YYYY"
  const dateMatch = allText.match(/zum\s+(\d{2}\.\d{2}\.\d{4})/);
  const date = dateMatch?.[1] ?? new Date().toLocaleDateString('de-DE');

  // Brokerage / Cash / Gesamt
  let brokerage = 0;
  let cash = 0;
  let total = 0;
  const brokerageMatch = allText.match(/Brokerage\s+([\d.,]+)/);
  const cashMatch = allText.match(/Cash\s+([\d.,]+)\s/);
  const totalMatch = allText.match(/GESAMT\s+([\d.,]+)\s*EUR/);
  if (brokerageMatch?.[1]) brokerage = parseGermanNumber(brokerageMatch[1]) ?? 0;
  if (cashMatch?.[1]) cash = parseGermanNumber(cashMatch[1]) ?? 0;
  if (totalMatch?.[1]) total = parseGermanNumber(totalMatch[1]) ?? 0;

  // Find the brokerage section: between "BROKERAGE" and "ANZAHL POSITIONEN"
  const startIdx = lines.findIndex((l) => l.startsWith('BROKERAGE'));
  const endIdx = lines.findIndex((l) => l.startsWith('ANZAHL POSITIONEN'));
  if (startIdx === -1 || endIdx === -1) {
    return { date, brokerage, cash, total, holdings: [] };
  }
  const brokerageLines = lines.slice(startIdx + 1, endIdx);

  // Find rows that contain an ISIN. Each holding spans multiple lines:
  //   "<shares> Stk. <name>"
  //   "<additional name lines>"
  //   "ISIN: <isin>"
  //   "<price> <date>"
  //   "<value>"
  // We scan for ISIN occurrences and gather context.
  const holdings: ParsedHolding[] = [];
  for (let i = 0; i < brokerageLines.length; i++) {
    const isinMatch = brokerageLines[i]!.match(ISIN_PATTERN);
    if (!isinMatch) continue;
    const isin = isinMatch[1]!;

    // Walk backwards to find the shares + name lines.
    let shares = 0;
    let nameParts: string[] = [];
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const line = brokerageLines[j]!;
      const sharesMatch = line.match(/^([\d.,]+)\s*Stk\.?\b\s*(.*)$/);
      if (sharesMatch) {
        shares = parseGermanNumber(sharesMatch[1]!) ?? 0;
        if (sharesMatch[2]) nameParts.unshift(sharesMatch[2]);
        break;
      } else {
        // Probably continuation of name
        if (
          !line.toUpperCase().includes('STK.') &&
          !line.toUpperCase().includes('ISIN') &&
          line.length > 0
        ) {
          nameParts.unshift(line);
        }
      }
    }

    // Walk forwards to find the price and value lines.
    let price = 0;
    let value = 0;
    for (let j = i + 1; j < Math.min(brokerageLines.length, i + 6); j++) {
      const line = brokerageLines[j]!;
      // Price line: "226,70 07.05.2026" or just a number followed by date
      const priceMatch = line.match(
        /^([\d.,]+)\s+\d{2}\.\d{2}\.\d{4}\s*([\d.,]+)?$/,
      );
      const valueOnlyMatch = line.match(/^([\d.,]+)\s*$/);
      if (priceMatch && price === 0) {
        price = parseGermanNumber(priceMatch[1]!) ?? 0;
        if (priceMatch[2]) {
          value = parseGermanNumber(priceMatch[2]!) ?? 0;
          break;
        }
      } else if (price !== 0 && valueOnlyMatch && value === 0) {
        value = parseGermanNumber(valueOnlyMatch[1]!) ?? 0;
        break;
      }
    }

    const name = nameParts.join(' ').replace(/\s+/g, ' ').trim();
    const isEtf =
      /\bETF\b|\(Acc\)|UCITS|MSCI|S&P|Nasdaq/i.test(name) ||
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

  return { date, brokerage, cash, total, holdings };
}
