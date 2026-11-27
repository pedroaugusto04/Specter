import type { UpdateIntegrationsRequest, UserIntegrationsDto } from '@specter/contracts';

export interface IntegrationFormValues {
  telegramEnabled: boolean;
  telegramChatId: string;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  clearWebhookSecret: boolean;
}

export function emptyIntegrationForm(): IntegrationFormValues {
  return {
    telegramEnabled: false,
    telegramChatId: '',
    webhookEnabled: false,
    webhookUrl: '',
    webhookSecret: '',
    clearWebhookSecret: false,
  };
}

export function integrationsToForm(data: UserIntegrationsDto): IntegrationFormValues {
  return {
    telegramEnabled: data.telegramEnabled,
    telegramChatId: data.telegramChatId ?? '',
    webhookEnabled: data.webhookEnabled,
    webhookUrl: data.webhookUrl ?? '',
    webhookSecret: '',
    clearWebhookSecret: false,
  };
}

export function isIntegrationFormDirty(
  form: IntegrationFormValues,
  initial: UserIntegrationsDto | null
): boolean {
  if (!initial) return false;
  return (
    form.telegramEnabled !== initial.telegramEnabled ||
    form.telegramChatId !== (initial.telegramChatId ?? '') ||
    form.webhookEnabled !== initial.webhookEnabled ||
    form.webhookUrl !== (initial.webhookUrl ?? '') ||
    Boolean(form.webhookSecret.trim()) ||
    form.clearWebhookSecret
  );
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

export function formToWebhookTest(form: Pick<IntegrationFormValues, 'webhookUrl' | 'webhookSecret' | 'clearWebhookSecret'>) {
  return {
    webhookUrl: form.webhookUrl.trim(),
    secret: form.clearWebhookSecret ? null : form.webhookSecret.trim() || undefined,
  };
}
