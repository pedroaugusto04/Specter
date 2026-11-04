import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

let queryClient: postgres.Sql | null = null;
let dbInstance: Database | null = null;

export function getDb(): Database {
  if (!dbInstance) {
    queryClient = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    dbInstance = drizzle(queryClient, { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (queryClient) {
    await queryClient.end({ timeout: 5 });
    queryClient = null;
    dbInstance = null;
  }
}

export { schema };
