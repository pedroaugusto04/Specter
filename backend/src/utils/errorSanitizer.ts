import {
  AntiBotBlockedError,
  CompilerTimeoutError,
  CompilerValidationError,
  DomainError,
  NavigationTimeoutError,
  SelectorMismatchError,
} from '../errors/domainErrors.js';

/**
 * Transforms an internal error or exception into a clean, human-readable,
 * user-facing message free of code stack traces, internal file paths, or raw token leaks.
 */
export function formatUserErrorMessage(error: unknown): string {
  if (error instanceof AntiBotBlockedError) {
    const msg = error.message.toLowerCase();
    if (msg.includes('redirecionamento') || msg.includes('account-verification') || msg.includes('checkpoint')) {
      return 'Bloqueio anti-bot detectado: o site redirecionou para uma tela de verificação de segurança ou CAPTCHA.';
    }
    if (error.httpStatus === 403 || error.httpStatus === 429) {
      return `Bloqueio anti-bot detectado: o site recusou o acesso (HTTP ${error.httpStatus}).`;
    }
    return 'Bloqueio anti-bot detectado: a página apresentou um desafio de segurança (Cloudflare / CAPTCHA).';
  }

  if (error instanceof NavigationTimeoutError) {
    return 'Tempo limite esgotado: o site demorou muito para responder e a navegação excedeu o tempo limite.';
  }

  if (error instanceof SelectorMismatchError) {
    return 'Incompatibilidade de seletores: os dados não foram encontrados na página (o layout do site pode ter mudado).';
  }

  if (error instanceof CompilerTimeoutError) {
    return 'Tempo limite de compilação excedido pelo agente de inteligência artificial.';
  }

  if (error instanceof CompilerValidationError) {
    const rawReason = error.message ? error.message.replace(/^[A-Za-z0-9_]+Error:\s*/, '') : '';
    return `Falha na validação do extrator (Smoke test): ${rawReason || 'os seletores compilados pela IA não extraíram os campos solicitados.'}`;
  }

  if (error instanceof DomainError) {
    return error.message;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);

  // Take only the first line to discard any attached stack traces
  const firstLine = rawMessage.split('\n')[0]?.trim() || 'Erro durante a execução.';

  // Strip error class names e.g. "Error: ", "BotBlockedError: ", "AntiBotBlockedError: "
  const cleaned = firstLine
    .replace(/^[A-Za-z0-9_]+Error:\s*/, '')
    // Strip file:// paths or internal paths
    .replace(/\(?file:\/\/\/[^)]*\)?/g, '')
    .replace(/\/app\/[^\s)]*/g, '')
    .replace(/[A-Za-z]:\\[^\s)]*/g, '')
    .trim();

  return cleaned || 'Erro inesperado durante o processamento.';
}
