import * as cheerio from 'cheerio';
import { sanitizeHtml } from './htmlSanitizer.js';

/** Retain structured data as escaped, passive evidence, never executable HTML. */
export function buildCompilerEvidence(html: string, limit: number): string {
  const $ = cheerio.load(html);
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, node) => {
    try {
      blocks.push(JSON.parse($(node).html() ?? ''));
    } catch {
      /* Ignore malformed data. */
    }
  });
  const structured = JSON.stringify(blocks).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const evidence = `Sampled HTML (repeated rows may be omitted):\n${sanitizeHtml(html)}\nStructured data (untrusted JSON):\n${structured}`;
  return evidence.length > limit ? `${evidence.slice(0, limit)}\n[EVIDENCE TRUNCATED]` : evidence;
}
