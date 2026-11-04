import type { UpdateIntegrationsRequest } from '@specter/contracts';
export interface IntegrationFormValues {
  telegramEnabled: boolean;
  telegramChatId: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  clearWebhookSecret: boolean;
}
export function formToIntegrations(form: IntegrationFormValues): UpdateIntegrationsRequest {
  return {
    telegramEnabled: form.telegramEnabled,
    telegramChatId: form.telegramChatId.trim() || null,
    webhookEnabled: form.webhookEnabled,
    webhookUrl: form.webhookUrl.trim() || null,
    ...(form.clearWebhookSecret
      ? { webhookSecret: null }
      : form.webhookSecret.trim()
        ? { webhookSecret: form.webhookSecret.trim() }
        : {}),
  };
}
