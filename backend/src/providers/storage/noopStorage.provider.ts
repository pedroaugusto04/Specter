import type { IStorageProvider, StorageUploadResult } from './storage.interface.js';

export class NoopStorageProvider implements IStorageProvider {
  public readonly isEnabled = false;

  async upload(_key: string, _body: Buffer, _contentType?: string): Promise<StorageUploadResult> {
    return {
      key: _key,
      publicUrl: '',
    };
  }

  getPublicUrl(_key: string): string {
    return '';
  }
}
