import { describe, expect, it } from 'vitest';
import { ScheduleCoordinator } from '../../src/queues/scheduleCoordinator.js';
import {
  InMemoryJobRepository,
  InMemoryUserRepository,
  MockJobScheduler,
} from '../helpers/testDoubles.js';

describe('user schedule coordination', () => {
  it('refreshes only the active schedules belonging to the requested user', async () => {
    const jobs = new InMemoryJobRepository();
    const users = new InMemoryUserRepository();
    const scheduler = new MockJobScheduler();
    const coordinator = new ScheduleCoordinator(jobs, users);
    const user = await users.createUser({ email: 'one@example.com', timezone: 'America/New_York' });
    const other = await users.createUser({ email: 'two@example.com', timezone: 'UTC' });
    const create = (userId: string) =>
      jobs.createJob({
        userId,
        url: 'https://example.com',
        userPrompt: 'Track',
        cronExpression: '0 9 * * *',
      });
    const active = await create(user.id);
    const paused = await create(user.id);
    const otherJob = await create(other.id);
    await jobs.updateJob(active.id, { status: 'ACTIVE' });
    await jobs.updateJob(paused.id, { status: 'PAUSED' });
    await jobs.updateJob(otherJob.id, { status: 'ACTIVE' });
    await scheduler.scheduleRepeatableJob(otherJob.id, '0 10 * * *');

    expect(await coordinator.timezoneForJob(active.id)).toBe('America/New_York');
    expect(await coordinator.activeSchedules()).toEqual(
      expect.arrayContaining([
        { id: active.id, cronExpression: '0 9 * * *', timezone: 'America/New_York' },
        { id: otherJob.id, cronExpression: '0 9 * * *', timezone: 'UTC' },
      ])
    );
    await coordinator.refreshUserSchedules(user.id, scheduler);
    expect(scheduler.scheduledRepeatables.get(active.id)).toBe(`repeat:${active.id}:0 9 * * *`);
    expect(scheduler.scheduledRepeatables.has(paused.id)).toBe(false);
    expect(scheduler.scheduledRepeatables.get(otherJob.id)).toBe(
      `repeat:${otherJob.id}:0 10 * * *`
    );
    expect((await jobs.findById(active.id))?.bullmqRepeatableKey).toBe(
      `repeat:${active.id}:0 9 * * *`
    );
  });
});
