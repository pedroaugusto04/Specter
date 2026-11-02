export interface StorageUploadResult {
  key: string;
  publicUrl: string;
}

export interface IStorageProvider {
  readonly isEnabled: boolean;
  upload(key: string, body: Buffer, contentType?: string): Promise<StorageUploadResult>;
  getPublicUrl(key: string): string;
}
