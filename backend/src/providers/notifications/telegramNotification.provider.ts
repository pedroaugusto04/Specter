import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type {
  AlertPayload,
  ITelegramNotificationProvider,
  TelegramSendOptions,
  TelegramTestResult,
} from './notification.interface.js';

export type { TelegramSendOptions, TelegramTestResult };

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '<i>null</i>';
  if (typeof val === 'object') return escapeHtml(JSON.stringify(val));
  return escapeHtml(String(val));
}

export class TelegramNotificationProvider implements ITelegramNotificationProvider {
  public readonly name = 'telegram';
  private readonly botToken: string;

  constructor(botToken?: string) {
    this.botToken = (botToken ?? env.TELEGRAM_BOT_TOKEN).trim();
  }

  private resolveToken(): string {
    if (!this.botToken) {
      throw new Error(
        'Telegram notifications are currently unavailable. Please contact support or try again later.'
      );
    }
    return this.botToken;
  }

  formatAlertMessage(payload: AlertPayload): string {
    const diff = payload.diffSummary;
    const changeNoun =
      diff.totalChanges === 1
        ? '1 change detected'
        : `${diff.totalChanges} changes detected`;

    const lines: string[] = [
      `🔔 <b>[Specter] ${escapeHtml(changeNoun)}</b>`,
      '',
      `🔗 <b>Target:</b> <a href="${escapeHtml(payload.targetUrl)}">${escapeHtml(payload.targetUrl)}</a>`,
    ];

    if (payload.userPrompt) {
      lines.push(`🎯 <b>Prompt:</b> <i>${escapeHtml(payload.userPrompt)}</i>`);
    }

    if (payload.triggerReasons && payload.triggerReasons.length > 0) {
      lines.push('');
      lines.push('🎯 <b>Trigger Conditions Met:</b>');
      for (const reason of payload.triggerReasons) {
        lines.push(`• <code>${escapeHtml(reason)}</code>`);
      }
    }

    const detectedTime = payload.detectedAt
      ? payload.detectedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      : new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    lines.push(`⏱ <b>Time:</b> ${detectedTime}`);
    lines.push('');
    lines.push('📊 <b>Detected Changes:</b>');

    const allChanges = [
      ...diff.modified.map((c) => `• <b>${escapeHtml(c.field)}</b>: <s>${formatValue(c.previousValue)}</s> ➔ <b>${formatValue(c.currentValue)}</b>`),
      ...diff.added.map((c) => `• <b>${escapeHtml(c.field)}</b> (added): <b>${formatValue(c.currentValue)}</b>`),
      ...diff.removed.map((c) => `• <b>${escapeHtml(c.field)}</b> (removed): <s>${formatValue(c.previousValue)}</s>`),
    ];

    if (allChanges.length > 0) {
      // Limit to first 15 changes to prevent Telegram message length limit (4096 chars)
      lines.push(...allChanges.slice(0, 15));
      if (allChanges.length > 15) {
        lines.push(`<i>...and ${allChanges.length - 15} more changes</i>`);
      }
    } else {
      lines.push('<i>Change detected in normalized content hash.</i>');
    }

    lines.push('');
    lines.push('<i>Dynamic-Scapper • Autonomous Web Monitor</i>');

    return lines.join('\n');
  }

  async sendAlert(payload: AlertPayload, options: TelegramSendOptions): Promise<void> {
    const token = this.resolveToken();
    const text = this.formatAlertMessage(payload);

    await this.postMessage(token, options.chatId, text);

    logger.info('Telegram alert dispatched successfully', {
      jobId: payload.jobId,
      chatId: options.chatId,
    });
  }

  async sendTestMessage(options: TelegramSendOptions): Promise<TelegramTestResult> {
    try {
      const token = this.resolveToken();
      const text = [
        '✅ <b>Specter Telegram Integration Test</b>',
        '',
        'Your Telegram notification channel is successfully connected to <b>Dynamic-Scapper</b>!',
        'Future monitor alerts and self-healing updates will be delivered here in real time.',
        '',
        `<i>Sent at: ${new Date().toISOString()}</i>`,
      ].join('\n');

      await this.postMessage(token, options.chatId, text);
      return { ok: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn('Telegram test notification failed', {
        chatId: options.chatId,
        errorMessage,
      });
      return { ok: false, error: errorMessage };
    }
  }

  private async postMessage(token: string, chatId: string, htmlText: string): Promise<void> {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error('Unable to deliver message to Telegram. Please verify your Chat ID and make sure you have started a conversation with the bot.');
    }
  }
}
