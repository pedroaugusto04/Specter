import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryRealtimeEventBus } from '../src/providers/realtime/inMemoryRealtime.provider.js';
import type { RealtimeEvent } from '../src/providers/realtime/realtime.interface.js';
import { AuthService } from '../src/services/authService.js';
import { IntegrationService } from '../src/services/integrationService.js';
import { JobService } from '../src/services/jobService.js';
import { RealtimeService } from '../src/services/realtimeService.js';
import {
  MockJobScheduler,
  MockScraperEngine,
  InMemoryJobRepository,
  InMemoryUserRepository,
} from './helpers/testDoubles.js';

describe('Realtime EventBus & SSE Streaming', () => {
  describe('InMemoryRealtimeEventBus', () => {
    it('notifies subscribers of events matching their userId', async () => {
      const bus = new InMemoryRealtimeEventBus();
      const receivedEvents: RealtimeEvent[] = [];

      const unsubscribe = bus.subscribe('user-123', (evt) => {
        receivedEvents.push(evt);
      });

      const event1: RealtimeEvent = {
        type: 'JOB_UPDATED',
        userId: 'user-123',
        jobId: 'job-1',
        status: 'ACTIVE',
        timestamp: new Date().toISOString(),
      };

      const event2: RealtimeEvent = {
        type: 'JOB_CREATED',
        userId: 'user-456',
        jobId: 'job-2',
        status: 'PENDING_COMPILATION',
        timestamp: new Date().toISOString(),
      };

      await bus.publish(event1);
      await bus.publish(event2);

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual(event1);

      unsubscribe();

      await bus.publish({
        ...event1,
        jobId: 'job-3',
      });

      // No new events received after unsubscription
      expect(receivedEvents).toHaveLength(1);
      await bus.close();
    });
  });

  describe('RealtimeService', () => {
    it('dispatches typed domain notifications with automated timestamps', async () => {
      const bus = new InMemoryRealtimeEventBus();
      const realtimeService = new RealtimeService(bus);
      const captured: RealtimeEvent[] = [];

      realtimeService.subscribeUser('user-999', (evt) => captured.push(evt));

      await realtimeService.notifyJobCreated('user-999', 'job-abc', 'PENDING_COMPILATION');
      await realtimeService.notifyJobUpdated('user-999', 'job-abc', 'ACTIVE');
      await realtimeService.notifyJobRunCompleted('user-999', 'job-abc', 'run-xyz', 'YES');
      await realtimeService.notifyJobDeleted('user-999', 'job-abc');

      expect(captured).toHaveLength(4);
      expect(captured[0].type).toBe('JOB_CREATED');
      expect(captured[1].type).toBe('JOB_UPDATED');
      expect(captured[2].type).toBe('JOB_RUN_COMPLETED');
      expect(captured[2].hasChanges).toBe('YES');
      expect(captured[3].type).toBe('JOB_DELETED');
      expect(captured[0].timestamp).toBeDefined();

      await realtimeService.close();
    });
  });

  describe('SSE HTTP Route (/api/events)', () => {
    it('serves SSE stream headers, handshake event, and pushes live domain events', async () => {
      const bus = new InMemoryRealtimeEventBus();
      const realtimeService = new RealtimeService(bus);

      const jobRepo = new InMemoryJobRepository();
      const userRepo = new InMemoryUserRepository();
      const scheduler = new MockJobScheduler();
      const scraper = new MockScraperEngine();

      const jobService = new JobService(jobRepo, scheduler, scraper, undefined, realtimeService);
      const authService = new AuthService(userRepo);
      const authenticated = await authService.register({
        email: 'events@example.com',
        password: 'events-test-password',
        name: 'Events owner',
      });
      const integrationService = {
        getIntegrationSettings: async () => ({}),
        updateIntegrationSettings: async () => ({}),
        testTelegramNotification: async () => ({ success: true, message: 'ok' }),
        testWebhookNotification: async () => ({ success: true, message: 'ok', statusCode: 200 }),
      } as unknown as IntegrationService;

      const app = await buildApp({
        jobService,
        authService,
        integrationService,
        realtimeService,
        enableLogger: false,
      });

      const anonymous = await app.inject({ method: 'GET', url: '/api/events' });
      expect(anonymous.statusCode).toBe(401);
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/api/events`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${authenticated.tokens.accessToken}` },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(response.headers.get('x-accel-buffering')).toBe('no');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      // Read initial connection event
      const firstChunk = await reader!.read();
      const initialText = new TextDecoder().decode(firstChunk.value);
      expect(initialText).toContain('event: connected');
      expect(initialText).toContain('"type":"CONNECTED"');

      // Publish a realtime event and verify it is pushed through SSE
      const chunkPromise = reader!.read();
      await realtimeService.notifyJobUpdated(authenticated.user.id, 'job-123', 'ACTIVE');
      const liveChunk = await chunkPromise;
      const liveText = new TextDecoder().decode(liveChunk.value);

      expect(liveText).toContain('event: JOB_UPDATED');
      expect(liveText).toContain('"jobId":"job-123"');
      expect(liveText).toContain('"status":"ACTIVE"');

      // Abort connection and verify clean shutdown
      controller.abort();
      await app.close();
      await realtimeService.close();
    });
  });
});
