export interface ParsedProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Parses an HTTP/HTTPS/SOCKS proxy string (e.g. "http://user:pass@p.webshare.io:80")
 * into the structured proxy configuration expected by Playwright.
 *
 * Chromium command-line flags do not accept embedded user:pass credentials in the
 * proxy server URL. This extracts credentials so Playwright authenticates properly.
 */
export function parseProxyConfig(rawProxy?: string): ParsedProxyConfig | undefined {
  if (!rawProxy || rawProxy.trim().length === 0) return undefined;
  const trimmed = rawProxy.trim();
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const url = new URL(withScheme);
    const portMatch = trimmed.match(/:(\d+)(?:\/|$|\?|#)/);
    const port = url.port || (portMatch ? portMatch[1] : '');
    const server = `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    return {
      server,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    };
  } catch {
    return { server: trimmed };
  }
}
