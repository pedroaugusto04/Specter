import { describe, expect, it } from 'vitest';
import { formToIntegrations } from '../../frontend/src/forms/integrationForm.js';

describe('Integration secret form behavior', () => {
  it('keeps saved secrets write-only and distinguishes preservation, replacement and removal', () => {
    const form = {
      telegramEnabled: false,
      telegramChatId: '',
      webhookEnabled: true,
      webhookUrl: ' https://example.com ',
      webhookSecret: '',
      clearWebhookSecret: false,
    };
    expect(formToIntegrations(form)).not.toHaveProperty('webhookSecret');
    expect(formToIntegrations({ ...form, webhookSecret: ' new-secret ' })).toHaveProperty(
      'webhookSecret',
      'new-secret'
    );
    expect(formToIntegrations({ ...form, clearWebhookSecret: true })).toHaveProperty(
      'webhookSecret',
      null
    );
  });
});
