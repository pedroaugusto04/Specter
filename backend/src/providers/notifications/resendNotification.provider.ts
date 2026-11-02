import { Resend } from 'resend';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { buildSpecterAlertEmail } from './emailTemplate.js';
import type { AlertPayload, INotificationProvider } from './notification.interface.js';
import { SPECTER_LOGO_PNG_BUFFER } from './specterLogo.js';

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
    if (!payload.to) {
      throw new Error('Cannot send email alert: recipient email address (payload.to) is missing.');
    }

    const { html, text } = buildSpecterAlertEmail(payload);

    // Format sender name nicely as "Specter <sender@domain.com>" if not already formatted
    const formattedFrom = this.fromEmail.includes('<')
      ? this.fromEmail
      : `Specter <${this.fromEmail}>`;

    const response = await this.client.emails.send({
      from: formattedFrom,
      to: payload.to,
      subject: payload.subject,
      html,
      text,
      attachments: [
        {
          filename: 'specter-logo.png',
          content: SPECTER_LOGO_PNG_BUFFER,
          contentType: 'image/png',
          inlineContentId: 'specter-logo',
        },
      ],
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
      to: payload.to,
      subject: payload.subject,
      emailId: response.data?.id,
    });
  }
}
