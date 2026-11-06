import * as cheerio from 'cheerio';

const TAGS_TO_STRIP = 'style, svg, noscript, iframe, link, track, canvas, object, embed';

const TRACKING_ATTR_PREFIXES = [
  'data-tracking',
  'data-analytics',
  'data-telemetry',
  'data-ga',
  'data-gtm',
  'aria-live',
  'on', // inline event handlers like onclick, onload, onerror
];

const SEMANTIC_META_PROPERTIES = new Set([
  'og:title',
  'og:description',
  'og:price:amount',
  'og:price:currency',
  'og:availability',
  'product:price:amount',
  'product:price:currency',
  'product:availability',
  'product:brand',
  'product:condition',
  'product:retailer_item_id',
  'article:published_time',
  'article:author',
  'twitter:title',
  'twitter:description',
]);

const SEMANTIC_META_NAMES = new Set([
  'description',
  'twitter:title',
  'twitter:description',
  'twitter:data1',
  'twitter:data2',
]);

const SEMANTIC_ITEMPROPS = new Set([
  'name',
  'headline',
  'description',
  'price',
  'lowPrice',
  'highPrice',
  'priceCurrency',
  'availability',
  'sku',
  'gtin',
  'brand',
  'ratingValue',
  'reviewCount',
]);

function shouldKeepMetaTag(attribs: Record<string, string | undefined>): boolean {
  const content = (attribs.content ?? '').trim();
  if (!content || content.startsWith('data:image/')) {
    return false;
  }

  const prop = (attribs.property ?? '').trim().toLowerCase();
  if (prop && SEMANTIC_META_PROPERTIES.has(prop)) {
    return true;
  }

  const name = (attribs.name ?? '').trim().toLowerCase();
  if (name && SEMANTIC_META_NAMES.has(name)) {
    return true;
  }

  const itemprop = (attribs.itemprop ?? '').trim();
  if (itemprop && SEMANTIC_ITEMPROPS.has(itemprop)) {
    return true;
  }

  return false;
}

export function shouldStripAttribute(attrName: string, attrValue: string): boolean {
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
 * 1. Strips scripts, styles and irrelevant tags without synthesizing DOM selectors.
 * 2. Preserves semantic content `<meta>` tags (OpenGraph, Product, Schema itemprop) while stripping noisy browser/verification meta tags.
 * 3. Strips telemetry/tracking attributes and base64 inline images (data:image/*).
 * 4. Prunes repetitive sibling nodes inside <ul>, <ol>, <tbody> to keep at most 3 sample nodes.
 */
export function sanitizeHtml(rawHtml: string, maxRepetitiveSamples = 3): string {
  const $ = cheerio.load(rawHtml);

  // 2. Remove executable scripts and tags irrelevant to extraction selectors
  $('script').remove();
  $(TAGS_TO_STRIP).remove();

  // 3. Keep only semantic data-bearing <meta> tags; strip browser/verification meta tags
  $('meta').each((_, el) => {
    if (el.type !== 'tag' || !el.attribs || !shouldKeepMetaTag(el.attribs)) {
      $(el).remove();
    }
  });

  // Remove HTML comments
  $('*')
    .contents()
    .each((_, node) => {
      if (node.type === 'comment') {
        $(node).remove();
      }
    });

  // 4. Clean telemetry attributes and base64 images
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

  // 5. Prune repeated sibling nodes (keeps at most `maxRepetitiveSamples` samples per container)
  $('ul, ol, tbody').each((_, container) => {
    const children = $(container).children();
    if (children.length > maxRepetitiveSamples) {
      children.slice(maxRepetitiveSamples).remove();
    }
  });

  return $.html().trim();
}
