import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../../frontend/src/lib/api.js';
afterEach(() => vi.unstubAllGlobals());
it('accepts the current HTTP data envelope', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: null })))
  );
  expect(await api.getMe()).toBeNull();
});
it('treats only authentication rejection as an absent session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 401 }))
  );
  expect(await api.getMe()).toBeNull();
});
it('propagates backend outages instead of reporting a logout', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 503 }))
  );
  await expect(api.getMe()).rejects.toMatchObject({ status: 503 });
});
it('propagates connection failures instead of reporting a logout', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Network unavailable');
    })
  );
  await expect(api.getMe()).rejects.toThrow('Network unavailable');
});
it('rejects obsolete unwrapped success responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ id: 'unexpected' })))
  );
  await expect(api.getMe()).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' });
});
it('uses the canonical validation fields without recreating them from obsolete error shapes', () => {
  const error = new ApiError('Invalid request', 400, {
    fields: { url: 'Invalid URL' },
    details: [{ field: 'ignored', message: 'Not a field mapping' }],
  });
  expect(error.fieldErrors).toEqual({ url: 'Invalid URL' });
});
