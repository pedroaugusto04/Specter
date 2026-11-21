/**
 * Shared HTML escaping and cell formatting utilities.
 */

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatHtmlCell(value: unknown): string {
  return escapeHtml(value);
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}
