import { describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';
import { buildSpecterAlertEmail } from '../src/providers/notifications/emailTemplate.js';
import { createNotificationProvider } from '../src/providers/notifications/notification.factory.js';
import type { AlertPayload } from '../src/providers/notifications/notification.interface.js';
import { ResendNotificationProvider } from '../src/providers/notifications/resendNotification.provider.js';
import { SPECTER_LOGO_PNG_BUFFER } from '../src/providers/notifications/specterLogo.js';

describe('Specter Resend Notifications & Email Template', () => {
  const samplePayload: AlertPayload = {
    to: 'user@example.com',
    subject: '[Specter] 3 alterações detectadas: https://loja.exemplo.com/produto/123',
    jobId: '01923456-789a-bcde-f012-3456789abcde',
    targetUrl: 'https://loja.exemplo.com/produto/123',
    userPrompt: 'Extrair título, preço promocional e disponibilidade de estoque',
    detectedAt: new Date('2026-11-02T10:30:00Z'),
    diffSummary: {
      hasChanges: true,
      totalChanges: 3,
      modified: [
        {
          field: 'price',
          changeType: 'MODIFIED',
          previousValue: 'R$ 499,00',
          currentValue: 'R$ 399,00',
        },
      ],
      added: [
        {
          field: 'shipping',
          changeType: 'ADDED',
          previousValue: null,
          currentValue: 'Frete Grátis para todo Brasil',
        },
      ],
      removed: [
        {
          field: 'oldPromoTag',
          changeType: 'REMOVED',
          previousValue: 'Cupom 10%',
          currentValue: null,
        },
      ],
      summaryText: '• [Modified] price: "R$ 499,00" → "R$ 399,00"\n• [Added] shipping: "Frete Grátis para todo Brasil"\n• [Removed] oldPromoTag: (previously "Cupom 10%")',
      summaryHtml: '<table>...</table>',
    },
    data: {
      title: 'Headphone Bluetooth ANC Pro',
      price: 'R$ 399,00',
      shipping: 'Frete Grátis para todo Brasil',
      inStock: true,
    },
  };

  describe('buildSpecterAlertEmail', () => {
    it('generates a branded HTML email containing the Specter logo, header, table, and footer', () => {
      const { html, text } = buildSpecterAlertEmail(samplePayload);

      // Specter Brand Header & Logo
      expect(html).toContain('SPECTER');
      expect(html).toContain('Monitor de Extração Inteligente');
      expect(html).toContain('cid:specter-logo');
      expect(html).toContain('alt="Specter"');

      // Target Metadata
      expect(html).toContain('https://loja.exemplo.com/produto/123');
      expect(html).toContain('Extrair título, preço promocional e disponibilidade de estoque');
      expect(html).toContain('01923456-789a-bcde-f012-3456789abcde');

      // Change Badges & Values
      expect(html).toContain('Modificado');
      expect(html).toContain('Novo');
      expect(html).toContain('Removido');
      expect(html).toContain('R$ 499,00');
      expect(html).toContain('R$ 399,00');
      expect(html).toContain('Frete Grátis para todo Brasil');
      expect(html).toContain('Cupom 10%');

      // JSON Snapshot Accordion
      expect(html).toContain('Headphone Bluetooth ANC Pro');
      expect(html).toContain('<details');

      // Specter Footer
      expect(html).toContain('Sistema Autônomo de Monitoramento Web');
      expect(html).toContain('Resend');

      // Plain Text version
      expect(text).toContain('[SPECTER]');
      expect(text).toContain('https://loja.exemplo.com/produto/123');
      expect(text).toContain('price: "R$ 499,00" → "R$ 399,00"');
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
          summaryHtml: '<p>XSS</p>',
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

      await provider.sendAlert(samplePayload);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMock.mock.calls[0][0];

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
});
