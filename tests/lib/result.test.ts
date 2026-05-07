import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  tryAsync,
  trySync,
  mapResult,
  unwrapOr,
} from '@/lib/result';

describe('Result', () => {
  it('ok wraps a value', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('err wraps an error', () => {
    const e = new Error('bad');
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(e);
  });

  it('isOk / isErr type guards work', () => {
    const a = ok('hi');
    const b = err(new Error('x'));
    expect(isOk(a)).toBe(true);
    expect(isErr(a)).toBe(false);
    expect(isOk(b)).toBe(false);
    expect(isErr(b)).toBe(true);
  });

  it('tryAsync wraps successful promises', async () => {
    const r = await tryAsync(async () => 'ok');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('ok');
  });

  it('tryAsync converts thrown errors into err', async () => {
    const r = await tryAsync(async () => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('boom');
  });

  it('trySync converts thrown values into err', () => {
    const r = trySync(() => {
      throw 'string-thrown';
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('string-thrown');
  });

  it('mapResult transforms ok values, leaves err untouched', () => {
    const a = mapResult(ok(2), (n) => n * 10);
    const b = mapResult(err<Error>(new Error('e')), (n: number) => n * 10);
    expect(a.ok && a.value).toBe(20);
    expect(b.ok).toBe(false);
  });

  it('unwrapOr returns fallback on err', () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err(new Error()), 99)).toBe(99);
  });
});
