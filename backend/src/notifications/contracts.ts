import type { AlertPayload } from '../providers/notifications/notification.interface.js';
export type DeliveryChannel = 'email' | 'telegram' | 'webhook';
export interface AlertDelivery {
  channel: DeliveryChannel;
  destination: string;
  payload: AlertPayload;
}
export interface IAlertRouter {
  prepare(payload: AlertPayload): Promise<AlertDelivery[]>;
}
export interface IAlertSender {
  deliver(delivery: AlertDelivery, deliveryId: string): Promise<void>;
}
export interface PendingDelivery extends AlertDelivery {
  id: string;
  attempts: number;
  claimToken: string;
}
export interface IOutboxRepository {
  claim(limit: number, maxAttempts: number): Promise<PendingDelivery[]>;
  complete(id: string, claimToken: string): Promise<void>;
  fail(id: string, claimToken: string, error: string, maxAttempts: number): Promise<void>;
}
