import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { IStorageProvider, StorageUploadResult } from './storage.interface.js';

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

export type SupabaseClientFactory = (url: string, key: string) => SupabaseClient;

export class SupabaseStorageProvider implements IStorageProvider {
  public readonly isEnabled: boolean;
  private readonly client: SupabaseClient | null = null;
  private readonly bucket: string;

  constructor(
    config?: Partial<SupabaseStorageConfig>,
    clientFactory: SupabaseClientFactory = (url, key) =>
      createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
  ) {
    const url = (config?.url ?? env.SUPABASE_URL).trim().replace(/\/$/, '');
    const serviceRoleKey = (config?.serviceRoleKey ?? env.SUPABASE_SERVICE_ROLE_KEY).trim();
    this.bucket = (config?.bucket ?? env.SUPABASE_STORAGE_BUCKET).trim();

    if (url && serviceRoleKey) {
      try {
        this.client = clientFactory(url, serviceRoleKey);
        this.isEnabled = true;
        logger.info('Supabase Storage provider initialized', {
          bucket: this.bucket,
          url,
        });
      } catch (err) {
        logger.error('Failed to initialize Supabase Storage client', { err });
        this.isEnabled = false;
      }
    } else {
      this.isEnabled = false;
      logger.debug('Supabase credentials not configured; Supabase Storage disabled');
    }
  }

  async upload(
    key: string,
    body: Buffer,
    contentType = 'image/jpeg'
  ): Promise<StorageUploadResult> {
    if (!this.isEnabled || !this.client) {
      throw new Error('Supabase Storage is not enabled or configured.');
    }

    const cleanKey = key.replace(/^\/+/, '');

    const { error } = await this.client.storage.from(this.bucket).upload(cleanKey, body, {
      contentType,
      cacheControl: '31536000',
      upsert: true,
    });

    if (error) {
      logger.error('Supabase Storage upload failed', {
        key: cleanKey,
        bucket: this.bucket,
        error: error.message,
      });
      throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
    }

    const publicUrl = this.getPublicUrl(cleanKey);

    logger.info('Screenshot uploaded to Supabase Storage successfully', {
      key: cleanKey,
      bucket: this.bucket,
      publicUrl,
      sizeBytes: body.length,
    });

    return {
      key: cleanKey,
      publicUrl,
    };
  }

  getPublicUrl(key: string): string {
    if (!this.client) return '';
    const cleanKey = key.replace(/^\/+/, '');
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(cleanKey);
    return data.publicUrl;
  }
}
