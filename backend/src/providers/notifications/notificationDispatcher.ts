import type { IIntegrationRepository } from '../../repositories/integrationRepository.js';
import type {
  AlertPayload,
  INotificationProvider,
  ITelegramNotificationProvider,
  IWebhookNotificationProvider,
} from './notification.interface.js';
import type { AlertDelivery, IAlertRouter, IAlertSender } from '../../notifications/contracts.js';
export interface NotificationDispatcherDeps {
  emailProvider: INotificationProvider;
  telegramProvider: ITelegramNotificationProvider;
  webhookProvider: IWebhookNotificationProvider;
  integrationRepository: IIntegrationRepository;
}
export class NotificationDispatcher implements IAlertRouter, IAlertSender {
  readonly name = 'composite-dispatcher';
  constructor(private readonly deps: NotificationDispatcherDeps) {}
  async prepare(payload: AlertPayload): Promise<AlertDelivery[]> {
    const deliveries: AlertDelivery[] = [];
    if (payload.to?.trim())
      deliveries.push({ channel: 'email', destination: payload.to.trim(), payload });
    const integration = payload.userId
      ? await this.deps.integrationRepository.findByUserId(payload.userId)
      : null;
    if (integration?.telegramEnabled && integration.telegramChatId)
      deliveries.push({ channel: 'telegram', destination: integration.telegramChatId, payload });
    const webhook =
      payload.webhookUrl?.trim() ||
      (integration?.webhookEnabled ? integration.webhookUrl?.trim() : null);
    if (webhook) deliveries.push({ channel: 'webhook', destination: webhook, payload });
    return deliveries;
  }
  async deliver(delivery: AlertDelivery, deliveryId: string): Promise<void> {
    const payload = {
      ...delivery.payload,
      detectedAt: delivery.payload.detectedAt ? new Date(delivery.payload.detectedAt) : undefined,
      deliveryId,
    };
    if (delivery.channel === 'email')
      return this.deps.emailProvider.sendAlert({ ...payload, to: delivery.destination });
    if (delivery.channel === 'telegram')
      return this.deps.telegramProvider.sendAlert(payload, { chatId: delivery.destination });
    if (delivery.channel === 'webhook') {
      const integration = payload.userId
        ? await this.deps.integrationRepository.findByUserId(payload.userId)
        : null;
      return this.deps.webhookProvider.sendAlert(payload, {
        webhookUrl: delivery.destination,
        secret: payload.webhookSecret ?? integration?.webhookSecret,
      });
    }
    const unsupported: never = delivery.channel;
    throw new Error('Unsupported delivery channel: ' + unsupported);
  }
}
