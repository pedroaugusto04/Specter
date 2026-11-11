import type { FastifyInstance } from 'fastify';
import { requireAuth, requireUser } from '../middlewares/authMiddleware.js';
import type { AuthService } from '../services/authService.js';
import type { IntegrationService } from '../services/integrationService.js';
import { assertSafeUrl } from '../utils/ssrfValidator.js';
import { testTelegramSchema, testWebhookSchema, updateIntegrationsSchema } from './schemas.js';

export function registerIntegrationRoutes(
  app: FastifyInstance,
  integrationService: IntegrationService,
  authService: AuthService
): void {
  const withAuth = requireAuth(authService);

  app.get('/api/integrations', { preHandler: [withAuth] }, async (request) => {
    const user = requireUser(request);
    const data = await integrationService.getIntegrations(user.id);
    return { data };
  });

  app.put('/api/integrations', { preHandler: [withAuth] }, async (request) => {
    const user = requireUser(request);
    const input = updateIntegrationsSchema.parse(request.body);
    if (input.webhookUrl) {
      await assertSafeUrl(input.webhookUrl, 'webhookUrl');
    }
    const updated = await integrationService.updateIntegrations(user.id, {
      telegramEnabled: input.telegramEnabled,
      telegramChatId: input.telegramChatId || null,
      webhookEnabled: input.webhookEnabled,
      webhookUrl: input.webhookUrl || null,
      ...(input.webhookSecret !== undefined
        ? { webhookSecret: input.webhookSecret?.trim() || null }
        : {}),
    });

    return { data: updated };
  });

  app.post(
    '/api/integrations/telegram/test',
    { preHandler: [withAuth] },
    async (request, reply) => {
      const user = requireUser(request);
      const input = testTelegramSchema.parse(request.body);
      const result = await integrationService.testTelegram({
        ...input,
        timezone: user.timezone,
      });

      if (!result.ok) {
        return reply.status(400).send({
          error: 'TELEGRAM_TEST_FAILED',
          message:
            result.error ??
            'Telegram notification is currently unavailable. Please verify your Chat ID or try again later.',
        });
      }

      const payload = { success: true, message: 'Telegram test message sent successfully.' };
      return { data: payload };
    }
  );

  app.post('/api/integrations/webhook/test', { preHandler: [withAuth] }, async (request, reply) => {
    const input = testWebhookSchema.parse(request.body);
    await assertSafeUrl(input.webhookUrl, 'webhookUrl');
    const result = await integrationService.testWebhook(input, requireUser(request).id);

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
    return { data: payload };
  });
}
