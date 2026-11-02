import { env } from '../../config/env.js';
import { NoopStorageProvider } from './noopStorage.provider.js';
import type { IStorageProvider } from './storage.interface.js';
import { SupabaseStorageProvider } from './supabaseStorage.provider.js';

export function createStorageProvider(): IStorageProvider {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStorageProvider();
  }
  return new NoopStorageProvider();
}
