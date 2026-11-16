import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { NotificationDispatcher } from '../../src/providers/notifications/notificationDispatcher.js';
import { TelegramNotificationProvider } from '../../src/providers/notifications/telegramNotification.provider.js';
import { WebhookNotificationProvider } from '../../src/providers/notifications/webhookNotification.provider.js';
import { IntegrationService } from '../../src/services/integrationService.js';
import { JobService } from '../../src/services/jobService.js';
import { AuthService } from '../../src/services/authService.js';
import type { AlertPayload } from '../../src/providers/notifications/notification.interface.js';
import {
  InMemoryIntegrationRepository,
  InMemoryJobRepository,
  InMemoryUserRepository,
  MockJobScheduler,
  MockNotificationProvider,
  MockScraperEngine,
} from '../helpers/testDoubles.js';

describe('Telegram & Webhook Notification Providers & Dispatcher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const sampleAlert: AlertPayload = {
    to: 'alerts@example.com',
    subject: '[Specter] 1 change detected: https://example.com/item',
    jobId: '00000000-0000-0000-0000-000000000001',
    targetUrl: 'https://example.com/item',
    userPrompt: 'Extract item price and stock',
    detectedAt: new Date('2026-11-02T12:00:00Z'),
    diffSummary: {
      hasChanges: true,
      totalChanges: 1,
      added: [],
      modified: [
        {
          field: 'price',
          changeType: 'MODIFIED',
          previousValue: '$100',
          currentValue: '$80',
        },
      ],
      removed: [],
      summaryText: 'price: $100 -> $80',
      summaryHtml: '<b>price</b>: $100 -> $80',
    },
    data: { price: '$80' },
    userId: 'user-123',
  };

  it('TelegramNotificationProvider formats HTML message and dispatches HTTP POST to Telegram Bot API', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    });

    const telegramProvider = new TelegramNotificationProvider('server-bot-token-env');
    await telegramProvider.sendAlert(sampleAlert, {
      chatId: '987654321',
    });

    expect(capturedUrl).toBe('https://api.telegram.org/botserver-bot-token-env/sendMessage');
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.chat_id).toBe('987654321');
    expect(capturedBody!.parse_mode).toBe('HTML');
    expect(capturedBody!.text).toContain('<b>[Specter] 1 change detected</b>');
    expect(capturedBody!.text).toContain('<s>$100</s> ➔ <b>$80</b>');
    // Telegram alert defaults to America/Sao_Paulo
    expect(capturedBody!.text).toContain('(America/Sao_Paulo)');
    expect(capturedBody!.text).not.toContain('UTC');
  });

  it('TelegramNotificationProvider formats alert with custom payload timezone', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const telegramProvider = new TelegramNotificationProvider('server-bot-token-env');
    await telegramProvider.sendAlert(
      { ...sampleAlert, timezone: 'America/New_York' },
      { chatId: '987654321' }
    );

    expect(capturedBody!.text).toContain('(America/New_York)');
    expect(capturedBody!.text).not.toContain('UTC');
  });

  it('TelegramNotificationProvider sends a test message successfully', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    });

    const telegramProvider = new TelegramNotificationProvider('server-bot-token-env');
    const result = await telegramProvider.sendTestMessage({
      chatId: '12345',
      timezone: 'America/Sao_Paulo',
    });

    expect(result.ok).toBe(true);
    expect(capturedBody!.text).toContain('(America/Sao_Paulo)');
    expect(capturedBody!.text).not.toContain('UTC');
  });

  it('WebhookNotificationProvider dispatches payload with HMAC-SHA256 signature when secret is provided', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init.headers as Record<string, string>;
      capturedBody = init.body as string;
      return {
        ok: true,
        status: 200,
      };
    });

    const webhookProvider = new WebhookNotificationProvider();
    await webhookProvider.sendAlert(sampleAlert, {
      webhookUrl: 'https://webhook.site/test-endpoint',
      secret: 'my-super-secret-key',
    });

    expect(capturedUrl).toBe('https://webhook.site/test-endpoint');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['X-Specter-Event']).toBe('monitor.change_detected');
    expect(capturedHeaders['X-Specter-Delivery-Id']).toBeDefined();

    // Verify HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', 'my-super-secret-key')
      .update(capturedBody)
      .digest('hex');
    expect(capturedHeaders['X-Specter-Signature-256']).toBe(`sha256=${expectedSignature}`);

    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.event).toBe('monitor.change_detected');
    expect(parsedBody.jobId).toBe(sampleAlert.jobId);
    expect(parsedBody.data).toEqual({ price: '$80' });
  });

  it('WebhookNotificationProvider sends a test event', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const webhookProvider = new WebhookNotificationProvider();
    const result = await webhookProvider.sendTestEvent({
      webhookUrl: 'https://webhook.site/test-endpoint',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('NotificationDispatcher dispatches to Email, Telegram, and Webhook simultaneously', async () => {
    const emailProvider = new MockNotificationProvider();
    const integrationRepo = new InMemoryIntegrationRepository();

    await integrationRepo.upsert('user-123', {
      telegramEnabled: true,
      telegramChatId: 'chat-999',
      telegramBotToken: 'bot-token-999',
      webhookEnabled: true,
      webhookUrl: 'https://webhook.example.com/alerts',
      webhookSecret: 'secret-123',
    });

    let telegramSent = false;
    let webhookSent = false;

    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('telegram.org')) {
        telegramSent = true;
      }
      if (String(url).includes('webhook.example.com')) {
        webhookSent = true;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const dispatcher = new NotificationDispatcher({
      emailProvider,
      telegramProvider: new TelegramNotificationProvider('server-bot-token-env'),
      webhookProvider: new WebhookNotificationProvider(),
      integrationRepository: integrationRepo,
    });

    for (const delivery of await dispatcher.prepare(sampleAlert))
      await dispatcher.deliver(delivery, crypto.randomUUID());

    expect(emailProvider.sentAlerts).toHaveLength(1);
    expect(telegramSent).toBe(true);
    expect(webhookSent).toBe(true);
  });

  it('NotificationDispatcher enriches deliveries with user timezone from userRepository and falls back to America/Sao_Paulo', async () => {
    const emailProvider = new MockNotificationProvider();
    const integrationRepo = new InMemoryIntegrationRepository();
    const userRepo = new InMemoryUserRepository();
    const user = await userRepo.createUser({
      email: 'user-tz@example.com',
      timezone: 'Europe/Lisbon',
    });

    const dispatcher = new NotificationDispatcher({
      emailProvider,
      telegramProvider: new TelegramNotificationProvider('server-bot-token-env'),
      webhookProvider: new WebhookNotificationProvider(),
      integrationRepository: integrationRepo,
      userRepository: userRepo,
    });

    const deliveries = await dispatcher.prepare({
      ...sampleAlert,
      userId: user.id,
      timezone: undefined,
    });

    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries[0]!.payload.timezone).toBe('Europe/Lisbon');

    // Deliver and verify email provider receives payload with resolved timezone
    await dispatcher.deliver(deliveries[0]!, crypto.randomUUID());
    expect(emailProvider.sentAlerts[0]!.timezone).toBe('Europe/Lisbon');

    // Without user in repository, falls back to America/Sao_Paulo
    const fallbackDeliveries = await dispatcher.prepare({
      ...sampleAlert,
      userId: 'non-existent-user',
      timezone: undefined,
    });
    expect(fallbackDeliveries[0]!.payload.timezone).toBe('America/Sao_Paulo');
  });

  it('NotificationDispatcher respects job-specific webhookUrl override and does not fall back to global secret when monitor has no secret', async () => {
    const emailProvider = new MockNotificationProvider();
    const integrationRepo = new InMemoryIntegrationRepository();
    await integrationRepo.upsert('user-123', {
      webhookEnabled: true,
      webhookSecret: 'my-integration-secret',
    });

    let deliveredUrl = '';
    let deliveredSignature = '';
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      deliveredUrl = String(url);
      deliveredSignature =
        (init?.headers as Record<string, string>)?.['X-Specter-Signature-256'] ?? '';
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const dispatcher = new NotificationDispatcher({
      emailProvider,
      telegramProvider: new TelegramNotificationProvider('server-bot-token-env'),
      webhookProvider: new WebhookNotificationProvider(),
      integrationRepository: integrationRepo,
    });

    const deliveries = await dispatcher.prepare({
      ...sampleAlert,
      to: '',
      webhookUrl: 'https://custom-job-webhook.org/endpoint',
    });
    for (const delivery of deliveries) await dispatcher.deliver(delivery, crypto.randomUUID());

    expect(deliveredUrl).toBe('https://custom-job-webhook.org/endpoint');
    expect(deliveredSignature).toBe('');
  });

  it('NotificationDispatcher signs with user integration secret when using global webhook URL', async () => {
    const emailProvider = new MockNotificationProvider();
    const integrationRepo = new InMemoryIntegrationRepository();
    await integrationRepo.upsert('user-123', {
      webhookEnabled: true,
      webhookUrl: 'https://global-webhook.org/endpoint',
      webhookSecret: 'my-integration-secret',
    });

    let deliveredUrl = '';
    let deliveredSignature = '';
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      deliveredUrl = String(url);
      deliveredSignature =
        (init?.headers as Record<string, string>)?.['X-Specter-Signature-256'] ?? '';
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const dispatcher = new NotificationDispatcher({
      emailProvider,
      telegramProvider: new TelegramNotificationProvider('server-bot-token-env'),
      webhookProvider: new WebhookNotificationProvider(),
      integrationRepository: integrationRepo,
    });

    const deliveries = await dispatcher.prepare({
      ...sampleAlert,
      to: '',
    });
    for (const delivery of deliveries) await dispatcher.deliver(delivery, crypto.randomUUID());

    expect(deliveredUrl).toBe('https://global-webhook.org/endpoint');
    expect(deliveredSignature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('NotificationDispatcher prioritizes job-specific webhookSecret over user integration secret', async () => {
    const emailProvider = new MockNotificationProvider();
    const integrationRepo = new InMemoryIntegrationRepository();
    await integrationRepo.upsert('user-123', {
      webhookEnabled: true,
      webhookSecret: 'global-integration-secret',
    });

    let deliveredUrl = '';
    let deliveredBody = '';
    let deliveredSignature = '';
    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      deliveredUrl = String(url);
      deliveredBody = String(init?.body ?? '');
      deliveredSignature =
        (init?.headers as Record<string, string>)?.['X-Specter-Signature-256'] ?? '';
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const dispatcher = new NotificationDispatcher({
      emailProvider,
      telegramProvider: new TelegramNotificationProvider('server-bot-token-env'),
      webhookProvider: new WebhookNotificationProvider(),
      integrationRepository: integrationRepo,
    });

    const jobSecret = 'job-specific-secret-123';
    const deliveries = await dispatcher.prepare({
      ...sampleAlert,
      to: '',
      webhookUrl: 'https://job-specific.org/endpoint',
      webhookSecret: jobSecret,
    });
    for (const delivery of deliveries) await dispatcher.deliver(delivery, crypto.randomUUID());

    expect(deliveredUrl).toBe('https://job-specific.org/endpoint');
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', jobSecret)
      .update(deliveredBody)
      .digest('hex')}`;
    expect(deliveredSignature).toBe(expectedSignature);
  });

  it('Integration HTTP REST endpoints allow retrieving and updating integration settings', async () => {
    const jobRepo = new InMemoryJobRepository();
    const jobScheduler = new MockJobScheduler();
    const scraperEngine = new MockScraperEngine();
    const integrationRepo = new InMemoryIntegrationRepository();
    const userRepo = new InMemoryUserRepository();
    const authService = new AuthService(userRepo);
    const telegramProvider = new TelegramNotificationProvider('server-bot-token-env');
    const webhookProvider = new WebhookNotificationProvider();

    const jobService = new JobService({
      jobRepository: jobRepo,
      jobScheduler,
      compilationControl: { cancelCompilation: () => false },
      scraperEngine,
    });
    const integrationService = new IntegrationService(
      integrationRepo,
      telegramProvider,
      webhookProvider
    );

    const app = await buildApp({
      jobService,
      authService,
      integrationService,
      enableLogger: false,
    });

    // 0. Unauthenticated access returns 401
    const unauthGet = await app.inject({
      method: 'GET',
      url: '/api/integrations',
    });
    expect(unauthGet.statusCode).toBe(401);

    const unauthPut = await app.inject({
      method: 'PUT',
      url: '/api/integrations',
      payload: { telegramEnabled: true },
    });
    expect(unauthPut.statusCode).toBe(401);

    // Register User A
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'integration-owner@example.com', password: 'password123' },
    });
    const setCookie = regRes.headers['set-cookie'] as string[];
    const authCookie = setCookie.map((c) => c.split(';')[0]).join('; ');

    // 1. GET initial (empty) integrations for User A
    const getRes1 = await app.inject({
      method: 'GET',
      url: '/api/integrations',
      headers: { cookie: authCookie },
    });
    expect(getRes1.statusCode).toBe(200);
    const getBody1 = JSON.parse(getRes1.body);
    expect(getBody1.data.telegramEnabled).toBe(false);

    // 2. PUT update integrations for User A
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/integrations',
      headers: { cookie: authCookie },
      payload: {
        telegramEnabled: true,
        telegramChatId: '12345678',
        webhookEnabled: true,
        webhookUrl: 'https://webhook.site/demo',
        webhookSecret: 'secret_123',
      },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.data.telegramEnabled).toBe(true);
    expect(putBody.data.telegramChatId).toBe('12345678');
    expect(putBody.data.webhookUrl).toBe('https://webhook.site/demo');

    // 3. GET after update for User A
    const getRes2 = await app.inject({
      method: 'GET',
      url: '/api/integrations',
      headers: { cookie: authCookie },
    });
    expect(getRes2.statusCode).toBe(200);
    const getBody2 = JSON.parse(getRes2.body);
    expect(getBody2.data.telegramEnabled).toBe(true);
    expect(getBody2.data.webhookUrl).toBe('https://webhook.site/demo');

    // 4. Test Telegram endpoint returns success and data payload (requires auth)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const testTelRes = await app.inject({
      method: 'POST',
      url: '/api/integrations/telegram/test',
      headers: { cookie: authCookie },
      payload: { chatId: '12345678' },
    });
    expect(testTelRes.statusCode).toBe(200);
    const testTelBody = JSON.parse(testTelRes.body);
    expect(testTelBody.data.success).toBe(true);
    expect(testTelBody.data.message).toBeDefined();

    // 5. Multi-tenant isolation: Register User B and verify they do not see User A's integrations
    const regResB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user-b@example.com', password: 'password123' },
    });
    const setCookieB = regResB.headers['set-cookie'] as string[];
    const authCookieB = setCookieB.map((c) => c.split(';')[0]).join('; ');

    const getResB = await app.inject({
      method: 'GET',
      url: '/api/integrations',
      headers: { cookie: authCookieB },
    });
    expect(getResB.statusCode).toBe(200);
    const getBodyB = JSON.parse(getResB.body);
    expect(getBodyB.data.telegramEnabled).toBe(false);
    expect(getBodyB.data.webhookUrl).toBeNull();

    await app.close();
  });

  it('TelegramNotificationProvider parses Telegram API 403 error when bot cannot initiate conversation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        error_code: 403,
        description: "Forbidden: bot can't initiate conversation with a user",
      }),
    });

    const telegramProvider = new TelegramNotificationProvider('test-token');
    const result = await telegramProvider.sendTestMessage({ chatId: '99999' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("bot can't initiate conversation");
    expect(result.error).toContain('Start (/start)');
  });

  it('TelegramNotificationProvider getBotUsername retrieves username from getMe API and caches it', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { id: 12345, is_bot: true, username: 'SpecterTestBot' },
        }),
      };
    });

    const telegramProvider = new TelegramNotificationProvider('test-token');
    const username1 = await telegramProvider.getBotUsername();
    const username2 = await telegramProvider.getBotUsername();

    expect(username1).toBe('SpecterTestBot');
    expect(username2).toBe('SpecterTestBot');
    expect(callCount).toBe(1); // Cached after first call
  });
});
