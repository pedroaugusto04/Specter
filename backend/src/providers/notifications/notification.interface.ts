import type { DiffSummary } from '../../types/domain.js';
import type { ExtractedPayload } from '../../types/extractor.js';

export interface BaseAlertPayload {
  kind?: 'change' | 'failure';
  deliveryId?: string;
  to?: string;
  subject: string;
  jobId: string;
  targetUrl: string;
  monitorName?: string;
  userPrompt?: string;
  detectedAt?: Date;
  userId?: string;
  timezone?: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  triggerReasons?: string[];
}

export interface ChangeAlertPayload extends BaseAlertPayload {
  kind?: 'change';
  diffSummary: DiffSummary;
  data: ExtractedPayload;
}

export interface FailureAlertPayload extends BaseAlertPayload {
  kind: 'failure';
  errorTitle: string;
  errorDescription: string;
  nextStep: string;
  failureCode?: string;
  requiresSessionRenewal?: boolean;
}

export type AlertPayload = ChangeAlertPayload | FailureAlertPayload;

export function isFailureAlert(payload: AlertPayload): payload is FailureAlertPayload {
  return payload.kind === 'failure';
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
