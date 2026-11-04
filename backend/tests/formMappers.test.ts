import { describe, expect, it } from 'vitest';
import {
  emptyJobForm,
  formToCreateJob,
  formToUpdateJob,
  jobToForm,
} from '../../frontend/src/forms/jobForm.js';
import { formToIntegrations } from '../../frontend/src/forms/integrationForm.js';
import { JobPresenter } from '../src/presentation/jobPresenter.js';
import { InMemoryJobRepository } from './helpers/testDoubles.js';

describe('Form payload contracts', () => {
  it('normalizes creation and editing without leaking UI fields', () => {
    const form = {
      ...emptyJobForm(),
      url: ' https://example.com ',
      userPrompt: ' Monitor title ',
      sendEmailAlerts: true,
      useCustomCron: true,
      customCron: ' */30 * * * * ',
    };
    const create = formToCreateJob(form, 'owner@example.com');
    expect(create).toMatchObject({
      url: 'https://example.com',
      userPrompt: 'Monitor title',
      notificationEmail: 'owner@example.com',
      cronExpression: '*/30 * * * *',
      webhookUrl: null,
    });
    expect(create).not.toHaveProperty('sendEmailAlerts');
    expect(create).not.toHaveProperty('useCustomCron');
    expect(create).not.toHaveProperty('triggerRules');
    expect(formToUpdateJob(form)).toHaveProperty('triggerRules', []);
  });
  it('initializes the editor from a DTO and preserves scheduling', async () => {
    const repository = new InMemoryJobRepository();
    const job = await repository.createJob({
      url: 'https://example.com',
      userPrompt: 'title',
      notificationEmail: '',
      cronExpression: '0 12 * * MON',
    });
    const updated = await repository.updateJob(job.id, {});
    const dto = await new JobPresenter().present(updated!);
    const values = jobToForm(dto);
    expect(values.useCustomCron).toBe(true);
    expect(formToUpdateJob(values)).toMatchObject({
      url: dto.url,
      cronExpression: dto.cronExpression,
    });
  });
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
