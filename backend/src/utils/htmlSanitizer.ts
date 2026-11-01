import * as cheerio from 'cheerio';

const TAGS_TO_STRIP = 'script, style, svg, noscript, iframe, link, meta, track, canvas, object, embed';

const TRACKING_ATTR_PREFIXES = [
  'data-tracking',
  'data-analytics',
  'data-telemetry',
  'data-ga',
  'data-gtm',
  'aria-live',
  'on', // inline event handlers like onclick, onload, onerror
];

function shouldStripAttribute(attrName: string, attrValue: string): boolean {
  const lowerName = attrName.toLowerCase();
  const trimmedValue = attrValue.trim().toLowerCase();

  if (trimmedValue.startsWith('data:image/')) {
    return true;
  }

  for (const prefix of TRACKING_ATTR_PREFIXES) {
    if (prefix === 'on') {
      if (/^on[a-z]+$/.test(lowerName)) {
        return true;
      }
    } else if (lowerName === prefix || lowerName.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes raw HTML before forwarding to AI compilers:
 * 1. Strips structurally irrelevant tags (<script>, <style>, <svg>, etc.) and comments.
 * 2. Strips telemetry/tracking attributes and base64 inline images (data:image/*).
 * 3. Prunes repetitive sibling nodes inside <ul>, <ol>, <tbody> to keep at most 3 sample nodes.
 */
export function sanitizeHtml(rawHtml: string, maxRepetitiveSamples = 3): string {
  const $ = cheerio.load(rawHtml);

  // 1. Remove tags irrelevant to extraction selectors
  $(TAGS_TO_STRIP).remove();

  // Remove HTML comments
  $('*')
    .contents()
    .each((_, node) => {
      if (node.type === 'comment') {
        $(node).remove();
      }
    });

  // 2. Clean telemetry attributes and base64 images
  $('*').each((_, el) => {
    if (el.type === 'tag' && el.attribs) {
      const attribs = el.attribs;
      for (const attr of Object.keys(attribs)) {
        const value = attribs[attr] ?? '';
        if (shouldStripAttribute(attr, value)) {
          delete attribs[attr];
        }
      }
    }
  });

  // 3. Prune repeated sibling nodes (keeps at most `maxRepetitiveSamples` samples per container)
  $('ul, ol, tbody').each((_, container) => {
    const children = $(container).children();
    if (children.length > maxRepetitiveSamples) {
      children.slice(maxRepetitiveSamples).remove();
    }
  });

  return $.html().trim();
}
