import type { DiffSummary } from '../../types/domain.js';
import type { ExtractedPayload } from '../../types/extractor.js';

export interface AlertPayload {
  deliveryId?: string;
  to?: string;
  subject: string;
  jobId: string;
  targetUrl: string;
  monitorName?: string;
  userPrompt?: string;
  detectedAt?: Date;
  diffSummary: DiffSummary;
  data: ExtractedPayload;
  userId?: string;
  timezone?: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  triggerReasons?: string[];
}

export interface INotificationProvider {
  readonly name: string;
  sendAlert(payload: AlertPayload): Promise<void>;
}

export interface TelegramSendOptions {
  chatId: string;
  timezone?: string;
}

export interface TelegramTestResult {
  ok: boolean;
  error?: string;
}

export interface ITelegramNotificationProvider {
  readonly name: string;
  sendAlert(payload: AlertPayload, options: TelegramSendOptions): Promise<void>;
  sendTestMessage(input: TelegramSendOptions): Promise<TelegramTestResult>;
  getBotUsername(): Promise<string | null>;
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
  sendTestEvent(input: WebhookSendOptions): Promise<WebhookTestResult>;
}
