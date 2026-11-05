export interface ChromeFingerprint {
  userAgent: string;
  secChUa: string;
}

/** Builds UA and client-hint headers consistent with the real Chromium version in use. */
export function buildChromeFingerprint(browserVersion: string): ChromeFingerprint {
  const major = /^(\d+)\./.exec(browserVersion)?.[1] ?? '131';
  return {
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
    secChUa: `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`,
  };
}
