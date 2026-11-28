import { describe, expect, it } from 'vitest';
import {
  FAILURE_ALERT_COOLDOWN_MS,
  buildFailureAlert,
  shouldSendFailureAlert,
} from '../../src/utils/failureAlertHelper.js';

describe('failureAlertHelper', () => {
  describe('shouldSendFailureAlert', () => {
    it('returns true if no failure alert was ever sent', () => {
      const job = { lastFailureAlertAt: null };
      expect(shouldSendFailureAlert(job)).toBe(true);
    });

    it('returns false if a failure alert was sent recently (within cooldown)', () => {
      const now = Date.now();
      const job = { lastFailureAlertAt: new Date(now - 1000 * 60 * 60) }; // 1h ago
      expect(shouldSendFailureAlert(job, now)).toBe(false);
    });

    it('returns true if the cooldown period has elapsed', () => {
      const now = Date.now();
      const job = {
        lastFailureAlertAt: new Date(now - (FAILURE_ALERT_COOLDOWN_MS + 1000)),
      };
      expect(shouldSendFailureAlert(job, now)).toBe(true);
    });
  });

  describe('buildFailureAlert', () => {
    it('constructs a failure payload with structured fields', () => {
      const job = {
        id: 'job-123',
        userId: 'user-456',
        name: 'My Store',
        url: 'https://store.example.com',
        userPrompt: 'Track prices',
        notificationEmail: 'user@example.com',
        webhookUrl: 'https://webhook.example.com',
        webhookSecret: 'secret',
        lastFailureAlertAt: null,
      };

      const alert = buildFailureAlert({
        job,
        errorTitle: 'Website Session Needs Attention',
        errorDescription: 'Session cookies expired.',
        nextStep: 'Reconnect using the extension.',
        failureCode: 'SESSION_EXPIRED',
        requiresSessionRenewal: true,
      });

      expect(alert).toMatchObject({
        kind: 'failure',
        jobId: 'job-123',
        userId: 'user-456',
        monitorName: 'My Store',
        targetUrl: 'https://store.example.com',
        to: 'user@example.com',
        subject: '[Specter] Attention required: My Store',
        errorTitle: 'Website Session Needs Attention',
        errorDescription: 'Session cookies expired.',
        nextStep: 'Reconnect using the extension.',
        failureCode: 'SESSION_EXPIRED',
        requiresSessionRenewal: true,
      });
    });
  });
});
