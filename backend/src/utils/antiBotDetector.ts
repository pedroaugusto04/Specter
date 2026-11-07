import { AntiBotBlockedError } from '../errors/domainErrors.js';

const SUSPICIOUS_URL_PATTERNS = [
  /\/account-verification/i,
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
  /<title[^>]*>\s*Just a moment\.\.\.\s*<\/title>/i,
  /<title[^>]*>\s*Attention Required!\s*\|\s*Cloudflare\s*<\/title>/i,
  /<title[^>]*>\s*Access Denied\s*<\/title>/i,
  /<title[^>]*>\s*Robot Check\s*<\/title>/i,
  /<title[^>]*>[^<]*(?:security challenge|human verification|verify you are human|are you a robot|are you human|bot detection)\b[^<]*<\/title>/i,
  /cf-chl-widget/i,
  /id=["']challenge-form["']/i,
  /id=["']px-captcha["']/i,
  /class=["'][^"']*px-captcha/i,
];

function isCaptchaInterstitial(rawHtml: string): boolean {
  const hasCaptchaMarker =
    /g-recaptcha/i.test(rawHtml) ||
    /h-captcha/i.test(rawHtml) ||
    /cf-turnstile/i.test(rawHtml);

  if (!hasCaptchaMarker) return false;

  // Title indicates a challenge / bot verification screen
  const hasChallengeTitle =
    /<title[^>]*>[^<]*(?:captcha|verify|human|robot|security|checkpoint|attention required|access denied)\b[^<]*<\/title>/i.test(
      rawHtml
    );
  if (hasChallengeTitle) return true;

  // Form explicitly posts to a captcha or security verification endpoint
  const hasChallengeForm =
    /<form[^>]*action=["'][^"']*(?:captcha|checkpoint|challenge|verify|validate)[^"']*["']/i.test(
      rawHtml
    );
  if (hasChallengeForm) return true;

  // Interstitial shell detection: challenge screens typically have minimal textual content and no semantic layout
  const bodyText = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasMainContentTag = /<(main|article|table)\b/i.test(rawHtml);

  if (!hasMainContentTag && bodyText.length < 350) {
    return true;
  }

  return false;
}

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

  if (isCaptchaInterstitial(rawHtml)) {
    throw new AntiBotBlockedError(
      `Anti-bot block detected: CAPTCHA challenge interstitial screen presented.`,
      403
    );
  }
}
