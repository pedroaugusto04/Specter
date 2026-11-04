export interface PlaywrightStorageCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface PlaywrightStorageOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

export interface PlaywrightStorageState {
  cookies: PlaywrightStorageCookie[];
  origins: PlaywrightStorageOrigin[];
}
