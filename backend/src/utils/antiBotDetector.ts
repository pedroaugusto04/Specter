import { AntiBotBlockedError } from '../errors/domainErrors.js';

/**
 * URL segments that unequivocally represent security checkpoints or CAPTCHA interstitials.
 */
const SECURITY_CHECKPOINT_URL_PATTERNS = [
  /\/account-verification/i,
  /\/checkpoint/i,
  /\/challenge/i,
  /\/recaptcha/i,
  /\/captcha/i,
  /\/bot-detection/i,
  /\/validateCaptcha/i,
  /_sec\/verify/i,
  /\/cdn-cgi\/challenge-platform/i,
  /challenges\.cloudflare\.com/i,
  /geo\.captcha-delivery\.com/i,
];

/**
 * Universal title markers typical of WAF interstitials and bot-challenge screens.
 */
const CHALLENGE_TITLE_PATTERN =
  /<title[^>]*>[^<]*(?:captcha|verify\b|human verification|verify you are human|are you a robot|are you human|robot check|bot detection|attention required|access denied|just a moment|security checkpoint|pardon our interruption)\b[^<]*<\/title>/i;

/**
 * Forms that specifically post to challenge or verification endpoints.
 */
const CHALLENGE_FORM_PATTERN =
  /<form[^>]*action=["'][^"']*(?:captcha|checkpoint|challenge|verify|validate|account-verification)[^"']*["']/i;

/**
 * Universal security & challenge provider indicators (scripts, widgets, or phrases).
 */
const SECURITY_CHALLENGE_INDICATORS = [
  /g-recaptcha/i,
  /h-captcha/i,
  /cf-turnstile/i,
  /cf-chl-widget/i,
  /px-captcha/i,
  /datadome/i,
  /akamai/i,
  /kasada/i,
  /incapsula/i,
  /aws-waf/i,
  /challenge-platform/i,
  /challenge-form/i,
  /security check/i,
  /human verification/i,
  /automated access/i,
];

/**
 * Evaluates whether an HTML document is an anti-bot challenge or interstitial holding page.
 * Uses a combination of:
 * 1. Challenge titles or validation form actions (immediate positive match).
 * 2. Structural density heuristic ("casca vazia"): presence of challenge indicators in a
 *    minimalist document lacking semantic layout (<main>, <article>, <table>) and with low text density (< 400 chars).
 */
function isChallengeInterstitial(rawHtml: string): boolean {
  if (CHALLENGE_TITLE_PATTERN.test(rawHtml)) return true;
  if (CHALLENGE_FORM_PATTERN.test(rawHtml)) return true;

  const hasChallengeIndicator = SECURITY_CHALLENGE_INDICATORS.some((pattern) =>
    pattern.test(rawHtml)
  );
  if (!hasChallengeIndicator) return false;

  // Real content pages possess semantic layout tags
  const hasSemanticContentTag = /<(main|article|table)\b/i.test(rawHtml);
  if (hasSemanticContentTag) return false;

  // Extract visible body text (excluding scripts, styles and HTML tags)
  const bodyText = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Challenge interstitials typically contain under 400 characters of total readable text
  return bodyText.length < 400;
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

  for (const pattern of SECURITY_CHECKPOINT_URL_PATTERNS) {
    if (pattern.test(url)) {
      throw new AntiBotBlockedError(
        `Anti-bot block detected via redirect to security checkpoint or CAPTCHA verification screen.`,
        403
      );
    }
  }

  if (isChallengeInterstitial(rawHtml)) {
    throw new AntiBotBlockedError(
      `Anti-bot block detected: security challenge interstitial screen presented.`,
      403
    );
  }
}
