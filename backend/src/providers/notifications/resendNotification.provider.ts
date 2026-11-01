import { Resend } from 'resend';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { AlertPayload, INotificationProvider } from './notification.interface.js';

export class ResendNotificationProvider implements INotificationProvider {
  public readonly name = 'resend';
  private readonly client: Resend;
  private readonly fromEmail: string;

  constructor(options: { apiKey?: string; fromEmail?: string; client?: Resend } = {}) {
    const apiKey = options.apiKey ?? env.RESEND_API_KEY;
    this.fromEmail = options.fromEmail ?? env.NOTIFICATION_FROM_EMAIL;
    this.client = options.client ?? new Resend(apiKey);
  }

  async sendAlert(payload: AlertPayload): Promise<void> {
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #111827;">
        <h2 style="margin-top: 0; color: #111827;">Change Detected in Monitored Target</h2>
        <p style="color: #4b5563; font-size: 14px;">
          Monitored URL: <a href="${payload.targetUrl}" style="color: #2563eb;">${payload.targetUrl}</a>
        </p>
        <div style="margin: 20px 0;">
          <h3 style="font-size: 15px; margin-bottom: 10px;">Summary of Changes (${payload.diffSummary.totalChanges})</h3>
          ${payload.diffSummary.summaryHtml}
        </div>
        <details style="margin-top: 20px; background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">
          <summary style="cursor: pointer; font-weight: 600; font-size: 13px; color: #374151;">Full Snapshot (JSON)</summary>
          <pre style="font-size: 12px; overflow-x: auto; margin-top: 10px; color: #1f2937;">${JSON.stringify(payload.data, null, 2)}</pre>
        </details>
      </div>
    `;

    const response = await this.client.emails.send({
      from: this.fromEmail,
      to: payload.to,
      subject: payload.subject,
      html: htmlBody,
      text: `${payload.subject}\nURL: ${payload.targetUrl}\n\n${payload.diffSummary.summaryText}`,
    });

    if (response.error) {
      logger.error('Failed to send email alert via Resend', {
        jobId: payload.jobId,
        provider: this.name,
        errorCode: 'NOTIFICATION_FAILED',
        errorMessage: response.error.message,
      });
      throw new Error(`Resend error: ${response.error.message}`);
    }

    logger.info('Transactional alert email sent via Resend', {
      jobId: payload.jobId,
      provider: this.name,
    });
  }
}
