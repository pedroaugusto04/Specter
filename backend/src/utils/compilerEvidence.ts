import { extractJsonLdBlocks, sanitizeHtml } from './htmlSanitizer.js';
import { truncateEvidence } from '../extraction/evidenceBudget.js';

/** Retain structured data as escaped, passive evidence before HTML so truncation preserves high-signal entities. */
export function buildCompilerEvidence(html: string, limit: number): string {
  const blocks = extractJsonLdBlocks(html);
  const rawStructured = JSON.stringify(blocks).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const structured = truncateEvidence(rawStructured, Math.max(256, Math.floor(limit * 0.35)));
  const evidence = `Structured data (untrusted JSON):\n${structured}\nSampled HTML (repeated rows may be omitted):\n${sanitizeHtml(html)}`;
  return truncateEvidence(evidence, limit);
}
