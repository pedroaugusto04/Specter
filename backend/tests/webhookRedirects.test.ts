import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebhookNotificationProvider } from '../src/providers/notifications/webhookNotification.provider.js';
import type { AlertPayload } from '../src/providers/notifications/notification.interface.js';
vi.mock('../src/utils/ssrfValidator.js', () => ({ assertSafeUrl: async (url: string) => url }));
let server: Server;
let url: string;
let redirectedRequests = 0;
beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/redirected') {
      redirectedRequests++;
      response.end();
      return;
    }
    response.writeHead(302, { Location: '/redirected' });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  url = `http://127.0.0.1:${address.port}/`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
describe('Webhook redirect policy', () => {
  it('never follows redirects for signed test events', async () => {
    const result = await new WebhookNotificationProvider().sendTestEvent({
      webhookUrl: url,
      secret: 'private-secret',
    });
    expect(result).toMatchObject({ ok: false, status: 302 });
    expect(redirectedRequests).toBe(0);
    expect(result.error).not.toContain('private-secret');
  });
  it('applies the same redirect policy to alert deliveries', async () => {
    const payload = {
      jobId: 'monitor',
      targetUrl: 'https://example.com',
      data: {},
      diffSummary: {},
    } as AlertPayload;
    await expect(
      new WebhookNotificationProvider().sendAlert(payload, {
        webhookUrl: url,
        secret: 'private-secret',
      })
    ).rejects.toThrow();
    expect(redirectedRequests).toBe(0);
  });
});
