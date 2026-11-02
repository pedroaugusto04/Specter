import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import type {
  AlertPayload,
  IWebhookNotificationProvider,
  WebhookSendOptions,
  WebhookTestResult,
} from './notification.interface.js';

export type { WebhookSendOptions, WebhookTestResult };

export class WebhookNotificationProvider implements IWebhookNotificationProvider {
  public readonly name = 'webhook';

  async sendAlert(payload: AlertPayload, options: WebhookSendOptions): Promise<void> {
    const deliveryId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const bodyObj = {
      event: 'monitor.change_detected',
      deliveryId,
      timestamp,
      jobId: payload.jobId,
      targetUrl: payload.targetUrl,
      userPrompt: payload.userPrompt ?? null,
      detectedAt: payload.detectedAt ? payload.detectedAt.toISOString() : timestamp,
      diffSummary: payload.diffSummary,
      data: payload.data,
    };

    const rawBody = JSON.stringify(bodyObj);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Specter-Web-Monitor/1.0',
      'X-Specter-Event': 'monitor.change_detected',
      'X-Specter-Delivery-Id': deliveryId,
      'X-Specter-Timestamp': timestamp,
    };

    if (options.secret && options.secret.trim()) {
      const signature = crypto
        .createHmac('sha256', options.secret.trim())
        .update(rawBody)
        .digest('hex');
      headers['X-Specter-Signature-256'] = `sha256=${signature}`;
    }

    const response = await fetch(options.webhookUrl.trim(), {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery failed with HTTP status ${response.status} (${response.statusText})`);
    }

    logger.info('Webhook alert dispatched successfully', {
      jobId: payload.jobId,
      webhookUrl: options.webhookUrl,
      deliveryId,
      httpStatus: response.status,
    });
  }

  async sendTestEvent(options: WebhookSendOptions): Promise<WebhookTestResult> {
    try {
      const deliveryId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      const bodyObj = {
        event: 'test.ping',
        deliveryId,
        timestamp,
        message: 'Specter Webhook integration test event',
        service: 'Dynamic-Scapper',
      };

      const rawBody = JSON.stringify(bodyObj);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Specter-Web-Monitor/1.0',
        'X-Specter-Event': 'test.ping',
        'X-Specter-Delivery-Id': deliveryId,
        'X-Specter-Timestamp': timestamp,
      };

      if (options.secret && options.secret.trim()) {
        const signature = crypto
          .createHmac('sha256', options.secret.trim())
          .update(rawBody)
          .digest('hex');
        headers['X-Specter-Signature-256'] = `sha256=${signature}`;
      }

      const response = await fetch(options.webhookUrl.trim(), {
        method: 'POST',
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: 'Webhook endpoint returned an error or could not be reached. Please check the URL.',
        };
      }

      return { ok: true, status: response.status };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { ok: false, error: errorMessage };
    }
  }
}
