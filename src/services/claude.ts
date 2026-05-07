import { tryAsync, type Result } from '@/lib/result';
import { secretsRepo } from '@/db/repositories/secrets';

export const CLAUDE_MODELS = {
  HAIKU: 'claude-haiku-4-5',
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-7',
} as const;

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface MessagesRequest {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  system?: string;
  temperature?: number;
}

export interface MessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

async function callMessages(
  apiKey: string,
  body: MessagesRequest,
): Promise<MessagesResponse> {
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }
  return (await res.json()) as MessagesResponse;
}

export async function probeAnthropicKey(
  apiKey: string,
): Promise<Result<true>> {
  return tryAsync(async (): Promise<true> => {
    await callMessages(apiKey, {
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return true;
  });
}

export async function callClaude(
  body: MessagesRequest,
): Promise<Result<MessagesResponse>> {
  const keyResult = await secretsRepo.get('anthropic_key');
  if (!keyResult.ok) return keyResult;
  if (!keyResult.value) {
    return {
      ok: false,
      error: new Error('No Anthropic API key stored'),
    };
  }
  return tryAsync(() => callMessages(keyResult.value!, body));
}
