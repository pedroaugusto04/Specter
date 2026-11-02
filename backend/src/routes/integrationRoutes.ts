import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../services/authService.js';
import type { IntegrationService } from '../services/integrationService.js';
import { resolveAuthenticatedUser } from './authRoutes.js';
import {
  testTelegramSchema,
  testWebhookSchema,
  updateIntegrationsSchema,
} from './schemas.js';

export function registerIntegrationRoutes(
  app: FastifyInstance,
  integrationService: IntegrationService,
  authService: AuthService
): void {
  app.get('/api/integrations', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, false);
    const userId = user?.id ?? 'default-user';
    const data = await integrationService.getIntegrations(userId);
    const botUsername = await integrationService.getBotUsername();
    return { data: { ...data, botUsername } };
  });

  app.put('/api/integrations', async (request, reply) => {
    const user = await resolveAuthenticatedUser(request, reply, authService, false);
    const userId = user?.id ?? 'default-user';

    const input = updateIntegrationsSchema.parse(request.body);
    const updated = await integrationService.updateIntegrations(userId, {
      telegramEnabled: input.telegramEnabled,
      telegramChatId: input.telegramChatId || null,
      webhookEnabled: input.webhookEnabled,
      webhookUrl: input.webhookUrl || null,
      webhookSecret: input.webhookSecret || null,
    });
    const botUsername = await integrationService.getBotUsername();

    return { data: { ...updated, botUsername } };
  });

  app.post('/api/integrations/telegram/test', async (request, reply) => {
    const input = testTelegramSchema.parse(request.body);
    const result = await integrationService.testTelegram(input);

    if (!result.ok) {
      return reply.status(400).send({
        error: 'TELEGRAM_TEST_FAILED',
        message:
          result.error ??
          'Telegram notification is currently unavailable. Please verify your Chat ID or try again later.',
      });
    }

    const payload = { success: true, message: 'Telegram test message sent successfully.' };
    return { ...payload, data: payload };
  });

  app.post('/api/integrations/webhook/test', async (request, reply) => {
    const input = testWebhookSchema.parse(request.body);
    const result = await integrationService.testWebhook(input);

    if (!result.ok) {
      return reply.status(400).send({
        error: 'WEBHOOK_TEST_FAILED',
        message:
          result.error ??
          'Webhook delivery failed. Please verify that the endpoint URL is accessible.',
        status: result.status,
      });
    }

    const payload = {
      success: true,
      message: 'Webhook test event delivered successfully.',
    };
    return { ...payload, data: payload };
  });
}
