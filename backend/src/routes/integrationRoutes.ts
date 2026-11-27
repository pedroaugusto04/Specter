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
        ? { webhookSecret: input.webhookSecret || null }
        : {}),
    });

    return { data: updated };
  });

  app.post('/api/integrations/telegram/test', { preHandler: [withAuth] }, async (request) => {
    const user = requireUser(request);
    const input = testTelegramSchema.parse(request.body);
    await integrationService.testTelegram({
      ...input,
      timezone: user.timezone,
    });

    return {
      data: {
        success: true,
        message: 'Telegram test message sent successfully.',
      },
    };
  });

  app.post('/api/integrations/webhook/test', { preHandler: [withAuth] }, async (request) => {
    const user = requireUser(request);
    const input = testWebhookSchema.parse(request.body);
    await assertSafeUrl(input.webhookUrl, 'webhookUrl');
    await integrationService.testWebhook(input, user.id);

    return {
      data: {
        success: true,
        message: 'Webhook test event delivered successfully.',
      },
    };
  });
}
