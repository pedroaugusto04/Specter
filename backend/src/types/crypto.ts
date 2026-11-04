export interface EncryptedJsonEnvelope {
  encrypted: true;
  v: 1;
  iv: string;
  tag: string;
  data: string;
}
