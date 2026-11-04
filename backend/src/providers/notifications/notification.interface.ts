import type { DiffSummary } from '../../types/domain.js';
import type { ExtractedPayload } from '../../types/extractor.js';

export interface AlertPayload {
  deliveryId?: string;
  to?: string;
  subject: string;
  jobId: string;
  targetUrl: string;
  userPrompt?: string;
  detectedAt?: Date;
  diffSummary: DiffSummary;
  data: ExtractedPayload;
  userId?: string;
  webhookUrl?: string | null;
  triggerReasons?: string[];
  screenshotUrl?: string;
}

export interface INotificationProvider {
  readonly name: string;
  sendAlert(payload: AlertPayload): Promise<void>;
}

export interface TelegramSendOptions {
  chatId: string;
}

export interface TelegramTestResult {
  ok: boolean;
  error?: string;
}

export interface ITelegramNotificationProvider {
  readonly name: string;
  sendAlert(payload: AlertPayload, options: TelegramSendOptions): Promise<void>;
  sendTestMessage(input: { chatId: string }): Promise<TelegramTestResult>;
  getBotUsername?(): Promise<string | null>;
}

export interface WebhookSendOptions {
  webhookUrl: string;
  secret?: string | null;
}

export interface WebhookTestResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface IWebhookNotificationProvider {
  readonly name: string;
  sendAlert(payload: AlertPayload, options: WebhookSendOptions): Promise<void>;
  sendTestEvent(input: { webhookUrl: string; secret?: string | null }): Promise<WebhookTestResult>;
}
