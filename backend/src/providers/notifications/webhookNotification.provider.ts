import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { assertSafeUrl } from '../../utils/ssrfValidator.js';
import type {
  AlertPayload,
  IWebhookNotificationProvider,
  WebhookSendOptions,
  WebhookTestResult,
} from './notification.interface.js';
export type { WebhookSendOptions, WebhookTestResult };

const WebhookEvent = { Change: 'monitor.change_detected', Test: 'test.ping' } as const;
type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];
const WebhookHeader = {
  ContentType: 'Content-Type',
  UserAgent: 'User-Agent',
  Event: 'X-Specter-Event',
  DeliveryId: 'X-Specter-Delivery-Id',
  Timestamp: 'X-Specter-Timestamp',
  Signature: 'X-Specter-Signature-256',
} as const;
const WebhookProtocol = {
  ContentType: 'application/json',
  UserAgent: 'Specter-Web-Monitor/1.0',
  Method: 'POST',
  Redirect: 'manual',
  Digest: 'sha256',
} as const;
const WebhookMessage = {
  Failed: 'Webhook endpoint returned an error or could not be reached. Please check the URL.',
  Test: 'Specter Webhook integration test event',
} as const;

export class WebhookNotificationProvider implements IWebhookNotificationProvider {
  public readonly name = 'webhook';
  /** One outbound policy for alerts and test requests. Signed payloads never follow redirects. */
  private async postEvent(
    event: WebhookEvent,
    deliveryId: string,
    data: Record<string, unknown>,
    options: WebhookSendOptions
  ): Promise<number> {
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify({ event, deliveryId, timestamp, ...data });
    const headers: Record<string, string> = {
      [WebhookHeader.ContentType]: WebhookProtocol.ContentType,
      [WebhookHeader.UserAgent]: WebhookProtocol.UserAgent,
      [WebhookHeader.Event]: event,
      [WebhookHeader.DeliveryId]: deliveryId,
      [WebhookHeader.Timestamp]: timestamp,
    };
    if (options.secret?.trim()) {
      const signature = crypto
        .createHmac(WebhookProtocol.Digest, options.secret.trim())
        .update(rawBody)
        .digest('hex');
      headers[WebhookHeader.Signature] = `${WebhookProtocol.Digest}=${signature}`;
    }
    const safeUrl = await assertSafeUrl(options.webhookUrl.trim(), 'webhookUrl');
    const response = await fetch(safeUrl, {
      method: WebhookProtocol.Method,
      redirect: WebhookProtocol.Redirect,
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(env.NOTIFICATION_TIMEOUT_MS),
    });
    try {
      if (!response.ok) throw new WebhookDeliveryError(response.status);
      return response.status;
    } finally {
      await response.body?.cancel();
    }
  }
  async sendAlert(payload: AlertPayload, options: WebhookSendOptions): Promise<void> {
    const deliveryId = payload.deliveryId ?? crypto.randomUUID();
    const httpStatus = await this.postEvent(
      WebhookEvent.Change,
      deliveryId,
      {
        jobId: payload.jobId,
        targetUrl: payload.targetUrl,
        userPrompt: payload.userPrompt ?? null,
        detectedAt: payload.detectedAt
          ? new Date(payload.detectedAt).toISOString()
          : new Date().toISOString(),
        triggerReasons: payload.triggerReasons ?? [],
        diffSummary: payload.diffSummary,
        data: payload.data,
      },
      options
    );
    logger.info('Webhook alert dispatched successfully', {
      jobId: payload.jobId,
      deliveryId,
      httpStatus,
    });
  }
  async sendTestEvent(options: WebhookSendOptions): Promise<WebhookTestResult> {
    try {
      const status = await this.postEvent(
        WebhookEvent.Test,
        crypto.randomUUID(),
        { message: WebhookMessage.Test, service: 'Specter' },
        options
      );
      return { ok: true, status };
    } catch (error) {
      return {
        ok: false,
        ...(error instanceof WebhookDeliveryError ? { status: error.httpStatus } : {}),
        error: WebhookMessage.Failed,
      };
    }
  }
}
class WebhookDeliveryError extends Error {
  constructor(readonly httpStatus: number) {
    super(WebhookMessage.Failed);
  }
}
