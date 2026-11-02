import { describe, expect, it } from 'vitest';
import {
  AntiBotBlockedError,
  CompilerTimeoutError,
  CompilerValidationError,
  NavigationTimeoutError,
  SelectorMismatchError,
} from '../src/errors/domainErrors.js';
import { formatUserErrorMessage } from '../src/utils/errorSanitizer.js';

describe('formatUserErrorMessage (Transparent & User-Friendly Errors)', () => {
  it('formats anti-bot redirect errors without leaking stack traces or query token URLs', () => {
    const rawError = new AntiBotBlockedError(
      'Bloqueio anti-bot detectado via redirecionamento para tela de verificação: https://www.mercadolivre.com.br/gz/account-verification?go=https%3A%2F%2F...&tid=8e139173-1984-4e91-a33b-818f6e807f24\n    at detectAntiBotBlock (file:///app/dist/utils/antiBotDetector.js:44:19)\n    at PlaywrightScraperEngine.fetchHtml (file:///app/dist/providers/scraping/playwrightScraper.provider.js:101:13)',
      403
    );

    const userFriendly = formatUserErrorMessage(rawError);

    expect(userFriendly).toBe(
      'Bloqueio anti-bot detectado: o site redirecionou para uma tela de verificação de segurança ou CAPTCHA.'
    );
    expect(userFriendly).not.toContain('file:///');
    expect(userFriendly).not.toContain('at detectAntiBotBlock');
    expect(userFriendly).not.toContain('tid=');
  });

  it('formats HTTP 403/429 anti-bot blocks clearly', () => {
    const err403 = new AntiBotBlockedError('Forbidden', 403);
    expect(formatUserErrorMessage(err403)).toBe(
      'Bloqueio anti-bot detectado: o site recusou o acesso (HTTP 403).'
    );

    const err429 = new AntiBotBlockedError('Too Many Requests', 429);
    expect(formatUserErrorMessage(err429)).toBe(
      'Bloqueio anti-bot detectado: o site recusou o acesso (HTTP 429).'
    );
  });

  it('formats navigation timeouts, selector mismatches, and compiler errors in clear language', () => {
    expect(formatUserErrorMessage(new NavigationTimeoutError('timeout 30000ms'))).toContain(
      'Tempo limite esgotado'
    );
    expect(formatUserErrorMessage(new SelectorMismatchError('empty'))).toContain(
      'Incompatibilidade de seletores'
    );
    expect(formatUserErrorMessage(new CompilerTimeoutError('cli dead-man'))).toContain(
      'Tempo limite de compilação'
    );
    expect(formatUserErrorMessage(new CompilerValidationError('smoke fail'))).toContain(
      'Falha na validação do extrator'
    );
  });

  it('strips code stack traces and file paths from generic unhandled errors', () => {
    const genericErr = new Error(
      'Failed to connect to host\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)\n    at file:///app/dist/server.js:42:15'
    );

    const cleaned = formatUserErrorMessage(genericErr);
    expect(cleaned).toBe('Failed to connect to host');
    expect(cleaned).not.toContain('TCPConnectWrap');
    expect(cleaned).not.toContain('file:///');
  });
});
