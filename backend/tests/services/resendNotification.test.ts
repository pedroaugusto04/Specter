import { describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';
import { parseEnv } from '../../src/config/env.js';
import { buildSpecterAlertEmail } from '../../src/providers/notifications/emailTemplate.js';
import { createNotificationProvider } from '../../src/providers/notifications/notification.factory.js';
import type { AlertPayload } from '../../src/providers/notifications/notification.interface.js';
import { ResendNotificationProvider } from '../../src/providers/notifications/resendNotification.provider.js';
import { SPECTER_LOGO_PNG_BUFFER } from '../../src/providers/notifications/specterLogo.js';

describe('Specter Resend Notifications & Email Template', () => {
  const samplePayload: AlertPayload = {
    to: 'user@example.com',
    subject: '[Specter] 3 changes detected: https://store.example.com/product/123',
    jobId: '01923456-789a-bcde-f012-3456789abcde',
    targetUrl: 'https://store.example.com/product/123',
    userPrompt: 'Extract title, promotional price and stock availability',
    detectedAt: new Date('2026-11-02T10:30:00Z'),
    diffSummary: {
      hasChanges: true,
      totalChanges: 3,
      modified: [
        {
          field: 'price',
          changeType: 'MODIFIED',
          previousValue: '$ 499.00',
          currentValue: '$ 399.00',
        },
      ],
      added: [
        {
          field: 'shipping',
          changeType: 'ADDED',
          previousValue: null,
          currentValue: 'Free Worldwide Shipping',
        },
      ],
      removed: [
        {
          field: 'oldPromoTag',
          changeType: 'REMOVED',
          previousValue: 'Coupon 10%',
          currentValue: null,
        },
      ],
      summaryText:
        '• [Modified] price: "$ 499.00" → "$ 399.00"\n• [Added] shipping: "Free Worldwide Shipping"\n• [Removed] oldPromoTag: (previously "Coupon 10%")',
    },
    data: {
      title: 'Headphone Bluetooth ANC Pro',
      price: '$ 399.00',
      shipping: 'Free Worldwide Shipping',
      inStock: true,
    },
  };

  describe('buildSpecterAlertEmail', () => {
    it('generates a branded HTML email containing the Specter logo, header, table, and footer', () => {
      const { html, text } = buildSpecterAlertEmail(samplePayload);

      // Specter Brand Header & Logo
      expect(html).toContain('SPECTER');
      expect(html).not.toContain('Intelligent Extraction Monitor');
      expect(html).toContain('cid:specter-logo');
      expect(html).toContain('alt="Specter"');

      // Target Metadata
      expect(html).toContain('https://store.example.com/product/123');
      expect(html).toContain('Extract title, promotional price and stock availability');
      expect(html).not.toContain('Job ID:');
      expect(html).toContain('See more on Specter');

      // Change Badges & Values
      expect(html).toContain('Modified');
      expect(html).toContain('New');
      expect(html).toContain('Removed');
      expect(html).toContain('$ 499.00');
      expect(html).toContain('$ 399.00');
      expect(html).toContain('Free Worldwide Shipping');
      expect(html).toContain('Coupon 10%');

      // JSON Snapshot Accordion
      expect(html).toContain('Headphone Bluetooth ANC Pro');
      expect(html).toContain('<details');
      expect(html).not.toContain('&#x1F4CB;');

      // Specter Footer
      expect(html).not.toContain('Autonomous Web Monitoring System');
      expect(html).not.toContain('Delivered reliably via Resend');

      // Plain Text version
      expect(text).toContain('[SPECTER]');
      expect(text).toContain('https://store.example.com/product/123');
      expect(text).toContain('price: "$ 499.00" → "$ 399.00"');
      expect(text).toContain('See more on Specter:');
      expect(text).not.toContain('Job ID:');
      // Date formatting defaults to America/Sao_Paulo instead of UTC
      expect(html).toContain('(America/Sao_Paulo)');
      expect(text).toContain('(America/Sao_Paulo)');
      expect(html).not.toContain('(UTC)');
      expect(text).not.toContain('(UTC)');
    });

    it('formats change date using the provided user timezone', () => {
      const nyPayload: AlertPayload = {
        ...samplePayload,
        timezone: 'America/New_York',
      };
      const { html, text } = buildSpecterAlertEmail(nyPayload);
      expect(html).toContain('(America/New_York)');
      expect(text).toContain('(America/New_York)');
      // 10:30 UTC is 05:30 in America/New_York (EST)
      expect(html).toMatch(/5:30:00\s*(AM)?/i);
    });

    it('escapes unsafe HTML to prevent injection vulnerabilities', () => {
      const maliciousPayload: AlertPayload = {
        ...samplePayload,
        targetUrl: 'https://evil.com/xss?q=<script>alert("xss")</script>',
        userPrompt: '<b>Injected bold</b>',
        diffSummary: {
          hasChanges: true,
          totalChanges: 1,
          modified: [
            {
              field: 'payload<img src=x onerror=alert(1)>',
              changeType: 'MODIFIED',
              previousValue: '<script>bad()</script>',
              currentValue: '"><img src=x onerror=alert(2)>',
            },
          ],
          added: [],
          removed: [],
          summaryText: 'XSS test',
        },
      };

      const { html } = buildSpecterAlertEmail(maliciousPayload);

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).not.toContain('<script>bad()</script>');
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    });
  });

  describe('ResendNotificationProvider', () => {
    it('sends an email via Resend with Specter logo inline attachment and formatted from address', async () => {
      const sendMock = vi.fn().mockResolvedValue({
        data: { id: 'email_msg_12345' },
        error: null,
      });

      const mockResendClient = {
        emails: {
          send: sendMock,
        },
      } as unknown as Resend;

      const provider = new ResendNotificationProvider({
        apiKey: 're_test_key_123',
        fromEmail: 'onboarding@resend.dev',
        client: mockResendClient,
      });

      await provider.sendAlert({ ...samplePayload, deliveryId: 'delivery-test' });

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0]![1]).toEqual({ idempotencyKey: 'delivery-test' });
      const callArgs = sendMock.mock.calls[0]![0];

      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.from).toBe('Specter <onboarding@resend.dev>');
      expect(callArgs.subject).toBe(samplePayload.subject);
      expect(callArgs.html).toContain('cid:specter-logo');
      expect(callArgs.text).toContain('[SPECTER]');

      // Verifies Specter Logo attachment
      expect(callArgs.attachments).toBeDefined();
      expect(callArgs.attachments).toHaveLength(1);
      expect(callArgs.attachments[0]).toMatchObject({
        filename: 'specter-logo.png',
        contentType: 'image/png',
        inlineContentId: 'specter-logo',
      });
      expect(callArgs.attachments[0].content).toEqual(SPECTER_LOGO_PNG_BUFFER);
    });

    it('throws when Resend API returns an error response', async () => {
      const sendMock = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Domain verification failed' },
      });

      const mockResendClient = {
        emails: {
          send: sendMock,
        },
      } as unknown as Resend;

      const provider = new ResendNotificationProvider({
        apiKey: 're_test_key_123',
        fromEmail: 'alerts@unverified.org',
        client: mockResendClient,
      });

      await expect(provider.sendAlert(samplePayload)).rejects.toThrow(
        'Resend error: Domain verification failed'
      );
    });
  });

  describe('createNotificationProvider Factory', () => {
    it('returns ResendNotificationProvider when provider is resend with a valid key', () => {
      const provider = new ResendNotificationProvider({
        apiKey: 're_custom_key',
        fromEmail: 'onboarding@resend.dev',
      });
      expect(provider.name).toBe('resend');
    });

    it('falls back to ConsoleNotificationProvider when provider is console or key is placeholder', () => {
      const consoleProvider = createNotificationProvider('console');
      expect(consoleProvider.name).toBe('console');
    });
  });

  describe('Environment Configuration for Resend', () => {
    it('throws when NOTIFICATION_PROVIDER is resend and RESEND_API_KEY is empty in production', () => {
      expect(() => {
        parseEnv({
          ENCRYPTION_KEY: 'a'.repeat(64),
          NODE_ENV: 'production',
          NOTIFICATION_PROVIDER: 'resend',
          RESEND_API_KEY: '',
        });
      }).toThrow('RESEND_API_KEY: Required when NOTIFICATION_PROVIDER is set to "resend"');
    });

    it('succeeds when NOTIFICATION_PROVIDER is resend and RESEND_API_KEY is provided', () => {
      const parsed = parseEnv({
        ENCRYPTION_KEY: 'a'.repeat(64),
        NODE_ENV: 'production',
        NOTIFICATION_PROVIDER: 'resend',
        RESEND_API_KEY: 're_valid_test_key_123',
        JWT_SECRET: 'super-secure-production-jwt-secret-key-32b',
      });
      expect(parsed.NOTIFICATION_PROVIDER).toBe('resend');
      expect(parsed.RESEND_API_KEY).toBe('re_valid_test_key_123');
      expect(parsed.NOTIFICATION_FROM_EMAIL).toBe('onboarding@resend.dev');
    });

    it('allows NOTIFICATION_PROVIDER=resend in test environment without crashing on missing key', () => {
      const parsed = parseEnv({
        ENCRYPTION_KEY: 'a'.repeat(64),
        NODE_ENV: 'test',
        NOTIFICATION_PROVIDER: 'resend',
        RESEND_API_KEY: '',
      });
      expect(parsed.NOTIFICATION_PROVIDER).toBe('resend');
      expect(parsed.RESEND_API_KEY).toBe('');
    });
  });
});
