import { tryAsync, type Result } from '@/lib/result';

const MARKETAUX_ENDPOINT = 'https://api.marketaux.com/v1/news/all';

export async function probeMarketauxKey(
  apiKey: string,
): Promise<Result<true>> {
  return tryAsync(async (): Promise<true> => {
    const url = `${MARKETAUX_ENDPOINT}?api_token=${encodeURIComponent(apiKey)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Marketaux error ${res.status}: ${text}`);
    }
    const data = (await res.json()) as { error?: { message?: string } };
    if (data.error) {
      throw new Error(data.error.message ?? 'Marketaux API error');
    }
    return true;
  });
}
