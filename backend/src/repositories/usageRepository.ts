import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { userMonthlyUsage } from '../db/schema.js';

export interface MonthlyUsage {
  compilationsCount: number;
  executionsCount: number;
}

export interface IUsageRepository {
  getUsage(userId: string, period?: string): Promise<MonthlyUsage>;
}

function getCurrentYearMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export class DrizzleUsageRepository implements IUsageRepository {
  constructor(private readonly db: Database) {}

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
}
