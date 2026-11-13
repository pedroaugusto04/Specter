import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/index.js';
import { userMonthlyUsage } from '../db/schema.js';

export interface MonthlyUsage {
  compilationsCount: number;
  executionsCount: number;
}

export interface IUsageRepository {
  getUsage(userId: string, period?: string): Promise<MonthlyUsage>;
  incrementCompilations(userId: string, period?: string): Promise<number>;
  incrementExecutions(userId: string, period?: string): Promise<number>;
}

export function getCurrentYearMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export class DrizzleUsageRepository implements IUsageRepository {
  private readonly db: Database;

  constructor(db?: Database) {
    this.db = db ?? getDb();
  }

  async getUsage(userId: string, period?: string): Promise<MonthlyUsage> {
    const currentPeriod = period ?? getCurrentYearMonth();
    const [row] = await this.db
      .select({
        compilationsCount: userMonthlyUsage.compilationsCount,
        executionsCount: userMonthlyUsage.executionsCount,
      })
      .from(userMonthlyUsage)
      .where(and(eq(userMonthlyUsage.userId, userId), eq(userMonthlyUsage.period, currentPeriod)));

    return {
      compilationsCount: row?.compilationsCount ?? 0,
      executionsCount: row?.executionsCount ?? 0,
    };
  }

  async incrementCompilations(userId: string, period?: string): Promise<number> {
    return this.incrementMetric(userId, 'compilationsCount', period);
  }

  async incrementExecutions(userId: string, period?: string): Promise<number> {
    return this.incrementMetric(userId, 'executionsCount', period);
  }

  private async incrementMetric(
    userId: string,
    metric: 'compilationsCount' | 'executionsCount',
    period?: string
  ): Promise<number> {
    const currentPeriod = period ?? getCurrentYearMonth();
    const isCompilation = metric === 'compilationsCount';

    const [row] = await this.db
      .insert(userMonthlyUsage)
      .values({
        userId,
        period: currentPeriod,
        compilationsCount: isCompilation ? 1 : 0,
        executionsCount: isCompilation ? 0 : 1,
      })
      .onConflictDoUpdate({
        target: [userMonthlyUsage.userId, userMonthlyUsage.period],
        set: {
          [metric]: sql`${userMonthlyUsage[metric]} + 1`,
          updatedAt: sql`NOW()`,
        },
      })
      .returning({ count: userMonthlyUsage[metric] });

    return row?.count ?? 1;
  }
}
