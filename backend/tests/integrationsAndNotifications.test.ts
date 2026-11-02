import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { NotificationDispatcher } from '../src/providers/notifications/notificationDispatcher.js';
import { TelegramNotificationProvider } from '../src/providers/notifications/telegramNotification.provider.js';
import { WebhookNotificationProvider } from '../src/providers/notifications/webhookNotification.provider.js';
import { IntegrationService } from '../src/services/integrationService.js';
import { JobService } from '../src/services/jobService.js';
import type { AlertPayload } from '../src/providers/notifications/notification.interface.js';
import {
  InMemoryIntegrationRepository,
  InMemoryJobRepository,
  MockJobScheduler,
  MockNotificationProvider,
} from './helpers/testDoubles.js';

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
    let capturedBody: any = null;

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
    expect(capturedBody.chat_id).toBe('987654321');
    expect(capturedBody.parse_mode).toBe('HTML');
    expect(capturedBody.text).toContain('<b>[Specter] 1 change detected</b>');
    expect(capturedBody.text).toContain('<s>$100</s> ➔ <b>$80</b>');
  });

  it('TelegramNotificationProvider sends a test message successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const telegramProvider = new TelegramNotificationProvider('server-bot-token-env');
    const result = await telegramProvider.sendTestMessage({
      chatId: '12345',
    });

    expect(result.ok).toBe(true);
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
      integrationRepository: integrationRepo as any,
    });

    await dispatcher.sendAlert(sampleAlert);

    expect(emailProvider.sentAlerts).toHaveLength(1);
    expect(telegramSent).toBe(true);
    expect(webhookSent).toBe(true);
  });

  it('NotificationDispatcher respects job-specific webhookUrl override', async () => {
    const emailProvider = new MockNotificationProvider();
    const integrationRepo = new InMemoryIntegrationRepository();

    let deliveredUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url) => {
      deliveredUrl = String(url);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    const dispatcher = new NotificationDispatcher({
      emailProvider,
      telegramProvider: new TelegramNotificationProvider('server-bot-token-env'),
      integrationRepository: integrationRepo as any,
    });

    await dispatcher.sendAlert({
      ...sampleAlert,
      to: '',
      webhookUrl: 'https://custom-job-webhook.org/endpoint',
    });

    expect(deliveredUrl).toBe('https://custom-job-webhook.org/endpoint');
  });

  it('Integration HTTP REST endpoints allow retrieving and updating integration settings', async () => {
    const jobRepo = new InMemoryJobRepository();
    const jobScheduler = new MockJobScheduler();
    const integrationRepo = new InMemoryIntegrationRepository();
    const jobService = new JobService(jobRepo as any, jobScheduler);
    const integrationService = new IntegrationService(integrationRepo as any);

    const app = await buildApp({
      jobService,
      integrationService,
      enableLogger: false,
    });

    // 1. GET initial (empty) integrations
    const getRes1 = await app.inject({
      method: 'GET',
      url: '/api/integrations',
    });
    expect(getRes1.statusCode).toBe(200);
    const getBody1 = JSON.parse(getRes1.body);
    expect(getBody1.data.telegramEnabled).toBe(false);

    // 2. PUT update integrations
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/integrations',
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

    // 3. GET after update
    const getRes2 = await app.inject({
      method: 'GET',
      url: '/api/integrations',
    });
    expect(getRes2.statusCode).toBe(200);
    const getBody2 = JSON.parse(getRes2.body);
    expect(getBody2.data.telegramEnabled).toBe(true);
    expect(getBody2.data.webhookUrl).toBe('https://webhook.site/demo');

    await app.close();
  });
});
