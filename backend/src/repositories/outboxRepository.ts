import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { alertDeliveries } from '../db/schema.js';
import type { IOutboxRepository, PendingDelivery } from '../notifications/contracts.js';

export class DrizzleOutboxRepository implements IOutboxRepository {
  constructor(private readonly db: Database) {}

  async claim(limit: number, maxAttempts: number): Promise<PendingDelivery[]> {
    const token = randomUUID();
    return this.db.transaction(async (tx) => {
      await tx
        .update(alertDeliveries)
        .set({
          status: 'FAILED',
          lastError: 'Delivery retry budget exhausted after an expired claim.',
          claimToken: null,
          lockedUntil: null,
        })
        .where(
          sql`${alertDeliveries.status} in ('PENDING','PROCESSING') and ${alertDeliveries.attempts} >= ${maxAttempts} and (${alertDeliveries.lockedUntil} is null or ${alertDeliveries.lockedUntil} < now())`
        );
      const selected = await tx
        .select()
        .from(alertDeliveries)
        .where(
          sql`${alertDeliveries.status} in ('PENDING','PROCESSING') and ${alertDeliveries.attempts} < ${maxAttempts} and ${alertDeliveries.nextAttemptAt} <= now() and (${alertDeliveries.lockedUntil} is null or ${alertDeliveries.lockedUntil} < now())`
        )
        .orderBy(alertDeliveries.nextAttemptAt)
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: PendingDelivery[] = [];
      for (const row of selected) {
        await tx
          .update(alertDeliveries)
          .set({
            status: 'PROCESSING',
            claimToken: token,
            lockedUntil: sql`now() + interval '5 minutes'`,
            attempts: row.attempts + 1,
          })
          .where(eq(alertDeliveries.id, row.id));
        claimed.push({
          id: row.id,
          channel: row.channel,
          destination: row.destination,
          payload: row.payload,
          attempts: row.attempts + 1,
          claimToken: token,
        });
      }
      return claimed;
    });
  }

  async complete(id: string, token: string): Promise<void> {
    await this.db
      .update(alertDeliveries)
      .set({
        status: 'SENT',
        sentAt: new Date(),
        lockedUntil: null,
        claimToken: null,
        lastError: null,
      })
      .where(and(eq(alertDeliveries.id, id), eq(alertDeliveries.claimToken, token)));
  }

  async fail(id: string, token: string, error: string, maxAttempts: number): Promise<void> {
    await this.db
      .update(alertDeliveries)
      .set({
        status: sql`case when ${alertDeliveries.attempts} >= ${maxAttempts} then 'FAILED' else 'PENDING' end`,
        lastError: error,
        lockedUntil: null,
        claimToken: null,
        nextAttemptAt: sql`now() + least(3600, power(2, ${alertDeliveries.attempts}) * 5) * interval '1 second'`,
      })
      .where(and(eq(alertDeliveries.id, id), eq(alertDeliveries.claimToken, token)));
  }
}
