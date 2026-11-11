import type { IIntegrationRepository } from '../../repositories/integrationRepository.js';
import type { IUserRepository } from '../../repositories/userRepository.js';
import type {
  AlertPayload,
  INotificationProvider,
  ITelegramNotificationProvider,
  IWebhookNotificationProvider,
} from './notification.interface.js';
import type { AlertDelivery, IAlertRouter, IAlertSender } from '../../notifications/contracts.js';
import { resolveTimezone } from '../../utils/dateFormatter.js';

export interface NotificationDispatcherDeps {
  emailProvider: INotificationProvider;
  telegramProvider: ITelegramNotificationProvider;
  webhookProvider: IWebhookNotificationProvider;
  integrationRepository: IIntegrationRepository;
  userRepository?: IUserRepository;
}

export class NotificationDispatcher implements IAlertRouter, IAlertSender {
  readonly name = 'composite-dispatcher';
  constructor(private readonly deps: NotificationDispatcherDeps) {}

  private async resolvePayloadTimezone(payload: AlertPayload): Promise<string> {
    if (payload.timezone?.trim()) {
      return resolveTimezone(payload.timezone);
    }
    if (payload.userId && this.deps.userRepository) {
      try {
        const user = await this.deps.userRepository.findById(payload.userId);
        if (user?.timezone) {
          return resolveTimezone(user.timezone);
        }
      } catch {
        // Fall back gracefully
      }
    }
    return resolveTimezone(undefined);
  }

  async prepare(payload: AlertPayload): Promise<AlertDelivery[]> {
    const timezone = await this.resolvePayloadTimezone(payload);
    const enrichedPayload: AlertPayload = {
      ...payload,
      timezone,
    };

    const deliveries: AlertDelivery[] = [];
    if (enrichedPayload.to?.trim())
      deliveries.push({
        channel: 'email',
        destination: enrichedPayload.to.trim(),
        payload: enrichedPayload,
      });
    const integration = enrichedPayload.userId
      ? await this.deps.integrationRepository.findByUserId(enrichedPayload.userId)
      : null;
    if (integration?.telegramEnabled && integration.telegramChatId)
      deliveries.push({
        channel: 'telegram',
        destination: integration.telegramChatId,
        payload: enrichedPayload,
      });
    const webhook =
      enrichedPayload.webhookUrl?.trim() ||
      (integration?.webhookEnabled ? integration.webhookUrl?.trim() : null);
    if (webhook)
      deliveries.push({ channel: 'webhook', destination: webhook, payload: enrichedPayload });
    return deliveries;
  }

  async deliver(delivery: AlertDelivery, deliveryId: string): Promise<void> {
    const timezone = await this.resolvePayloadTimezone(delivery.payload);
    const payload: AlertPayload = {
      ...delivery.payload,
      detectedAt: delivery.payload.detectedAt ? new Date(delivery.payload.detectedAt) : undefined,
      deliveryId,
      timezone,
    };
    if (delivery.channel === 'email')
      return this.deps.emailProvider.sendAlert({ ...payload, to: delivery.destination });
    if (delivery.channel === 'telegram')
      return this.deps.telegramProvider.sendAlert(payload, { chatId: delivery.destination });
    if (delivery.channel === 'webhook') {
      const hasCustomWebhookUrl = Boolean(payload.webhookUrl?.trim());
      const integration =
        !hasCustomWebhookUrl && payload.userId
          ? await this.deps.integrationRepository.findByUserId(payload.userId)
          : null;
      const secret = hasCustomWebhookUrl
        ? payload.webhookSecret?.trim() || undefined
        : integration?.webhookSecret?.trim() || undefined;
      return this.deps.webhookProvider.sendAlert(payload, {
        webhookUrl: delivery.destination,
        secret,
      });
    }
    const unsupported: never = delivery.channel;
    throw new Error('Unsupported delivery channel: ' + unsupported);
  }
}
