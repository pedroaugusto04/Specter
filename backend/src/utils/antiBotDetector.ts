import { AntiBotBlockedError } from '../errors/domainErrors.js';

const SUSPICIOUS_URL_PATTERNS = [
  /\/account-verification/i,
  /\/gz\/account-verification/i,
  /\/checkpoint/i,
  /\/challenge/i,
  /\/recaptcha/i,
  /\/captcha/i,
  /\/bot-detection/i,
  /\/validateCaptcha/i,
  /challenges\.cloudflare\.com/i,
  /\/cdn-cgi\/challenge-platform/i,
  /geo\.captcha-delivery\.com/i,
  /px-captcha/i,
];

const SUSPICIOUS_HTML_PATTERNS = [
  /action=["'][^"']*account-verification/i,
  /<title[^>]*id=["']root-title["'][^>]*>Mercado Libre<\/title>/i,
  /<title[^>]*>Just a moment\.\.\.<\/title>/i,
  /<title[^>]*>Attention Required! \| Cloudflare<\/title>/i,
  /<title[^>]*>Access Denied<\/title>/i,
  /<title[^>]*>Robot Check<\/title>/i,
  /cf-chl-widget/i,
  /g-recaptcha/i,
  /h-captcha/i,
  /Verifique que você é humano/i,
  /Confirme que você é um ser humano/i,
  /Para continuar navegando, digite o código/i,
  /Please complete the security check to access/i,
  /Por favor, verifique se você é humano/i,
];

/**
 * Checks for HTTP status codes, redirection URLs, and DOM patterns
 * that indicate the target site presented a CAPTCHA, WAF challenge, or bot-block screen.
 *
 * Throws AntiBotBlockedError if a block is detected.
 */
export function detectAntiBotBlock(url: string, rawHtml: string, httpStatus: number): void {
  if (httpStatus === 403 || httpStatus === 429) {
    throw new AntiBotBlockedError(
      `Anti-bot block detected with HTTP status ${httpStatus}.`,
      httpStatus
    );
  }

  for (const pattern of SUSPICIOUS_URL_PATTERNS) {
    if (pattern.test(url)) {
      throw new AntiBotBlockedError(
        `Anti-bot block detected via redirect to security checkpoint or CAPTCHA verification screen.`,
        403
      );
    }
  }

  for (const pattern of SUSPICIOUS_HTML_PATTERNS) {
    if (pattern.test(rawHtml)) {
      throw new AntiBotBlockedError(
        `Anti-bot block or security challenge detected in page content.`,
        403
      );
    }
  }
}
