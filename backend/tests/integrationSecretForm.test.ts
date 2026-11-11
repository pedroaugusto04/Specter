import { describe, expect, it } from 'vitest';
import { formToIntegrations } from '../../frontend/src/forms/integrationForm.js';
import {
  emptyJobForm,
  formToCreateJob,
  formToUpdateJob,
} from '../../frontend/src/forms/jobForm.js';

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

  it('job form maps webhook secret for create and update cleanly', () => {
    const form = emptyJobForm();
    form.url = 'https://example.com';
    form.userPrompt = 'Price check';
    form.showCustomWebhook = true;
    form.webhookUrl = 'https://custom-webhook.com/api';
    form.webhookSecret = '  secret-123  ';

    const createPayload = formToCreateJob(form);
    expect(createPayload.webhookSecret).toBe('secret-123');

    // If custom webhook is toggled off, webhookSecret is null
    const noWebhookForm = { ...form, showCustomWebhook: false };
    expect(formToCreateJob(noWebhookForm).webhookSecret).toBeNull();

    // On update: empty secret preserves existing (property deleted/undefined)
    const emptySecretForm = { ...form, webhookSecret: '' };
    expect(formToUpdateJob(emptySecretForm)).not.toHaveProperty('webhookSecret');

    // On update: new secret updates it
    expect(formToUpdateJob(form)).toHaveProperty('webhookSecret', 'secret-123');

    // On update: clearWebhookSecret explicitly sets null
    expect(formToUpdateJob(emptySecretForm, { clearWebhookSecret: true })).toHaveProperty(
      'webhookSecret',
      null
    );
  });
});
