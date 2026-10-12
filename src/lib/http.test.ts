import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { UpstreamError, fetchJson, parseRetryAfter, redactUrl } from './http';

const schema = z.object({ ok: z.boolean() });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const noSleep = vi.fn(async () => {});

describe('fetchJson', () => {
  it('returns schema-validated data', async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true }));
    await expect(fetchJson('https://x.test/a', { source: 't', schema, fetchImpl, sleep: noSleep })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 429/5xx and honours Retry-After', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(fetchJson('https://x.test', { source: 't', schema, fetchImpl, sleep, retries: 2 })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
  });

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn(async () => json({ message: 'nope' }, 404));
    await expect(fetchJson('https://x.test', { source: 't', schema, fetchImpl, sleep: noSleep })).rejects.toMatchObject({
      status: 404,
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries network failures, then surfaces a retryable error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await fetchJson('https://x.test', { source: 't', schema, fetchImpl, sleep: noSleep, retries: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.retryable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails loudly (no retry) on schema drift', async () => {
    const fetchImpl = vi.fn(async () => json({ ok: 'yes' }));
    await expect(fetchJson('https://x.test', { source: 't', schema, fetchImpl, sleep: noSleep })).rejects.toThrow(/unexpected response shape.*ok/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never leaks API keys into errors', async () => {
    const fetchImpl = vi.fn(async () => json({}, 401));
    const err = await fetchJson('https://x.test/odds?apiKey=SECRET123&x=1', { source: 't', schema, fetchImpl, sleep: noSleep }).catch((e) => e);
    expect(err.message).not.toContain('SECRET123');
    expect(err.message).toContain('apiKey=***');
  });
});

describe('helpers', () => {
  it('parses Retry-After as seconds or HTTP date', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('redacts common key params', () => {
    expect(redactUrl('https://a.test/?api_key=abc&token=def&q=1')).toBe('https://a.test/?api_key=***&token=***&q=1');
  });
});
