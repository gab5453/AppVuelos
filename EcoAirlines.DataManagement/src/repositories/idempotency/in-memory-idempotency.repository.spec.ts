import { describe, expect, it } from 'vitest';
import { IdempotencyDataContext } from '@ecoairlines/data-access/context/idempotency.context.js';
import { IDEMPOTENCY_TTL_MS, InMemoryIdempotencyRepository } from './in-memory-idempotency.repository.js';

describe('InMemoryIdempotencyRepository', () => {
  it('claims a brand new key', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    const result = await store.claim('key-1', 'fingerprint-a');
    expect(result).toEqual({ outcome: 'CLAIMED' });
  });

  it('returns the cached record when the same key is completed with the same fingerprint', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    await store.claim('key-1', 'fingerprint-a');
    await store.complete('key-1', { statusCode: 201, body: { ok: true }, createdAt: new Date() });

    const result = await store.claim('key-1', 'fingerprint-a');
    expect(result.outcome).toBe('COMPLETED');
    if (result.outcome === 'COMPLETED') {
      expect(result.record.statusCode).toBe(201);
      expect(result.record.body).toEqual({ ok: true });
    }
  });

  it('rejects reusing the same key with a different fingerprint (incompatible reuse)', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    await store.claim('key-1', 'fingerprint-a');
    await store.complete('key-1', { statusCode: 201, body: {}, createdAt: new Date() });

    const result = await store.claim('key-1', 'fingerprint-b');
    expect(result).toEqual({ outcome: 'CONFLICT' });
  });

  it('reports a matching key still in progress instead of double-claiming it', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    await store.claim('key-1', 'fingerprint-a');

    const result = await store.claim('key-1', 'fingerprint-a');
    expect(result).toEqual({ outcome: 'IN_PROGRESS' });
  });

  it('treats a concurrent same-key different-fingerprint claim as a conflict even before completion', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    await store.claim('key-1', 'fingerprint-a');

    const result = await store.claim('key-1', 'fingerprint-b');
    expect(result).toEqual({ outcome: 'CONFLICT' });
  });

  it('releases an in-progress claim so a failed operation can be retried', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    await store.claim('key-1', 'fingerprint-a');
    await store.release('key-1');

    const result = await store.claim('key-1', 'fingerprint-a');
    expect(result).toEqual({ outcome: 'CLAIMED' });
  });

  it('expira las keys tras 24 h: la misma key vuelve a poder reclamarse', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    let now = Date.parse('2026-10-01T00:00:00Z');
    store.now = () => now;
    await store.claim('key-1', 'fingerprint-a');
    await store.complete('key-1', { statusCode: 201, body: {}, createdAt: new Date(now) });

    now += IDEMPOTENCY_TTL_MS + 1;
    expect(await store.claim('key-1', 'fingerprint-b')).toEqual({ outcome: 'CLAIMED' });
  });

  it('does not release a claim that already completed', async () => {
    const store = new InMemoryIdempotencyRepository(new IdempotencyDataContext());
    await store.claim('key-1', 'fingerprint-a');
    await store.complete('key-1', { statusCode: 200, body: {}, createdAt: new Date() });
    await store.release('key-1');

    const result = await store.claim('key-1', 'fingerprint-a');
    expect(result.outcome).toBe('COMPLETED');
  });
});
