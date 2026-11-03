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

function appendMetaIfMissing(
  $: cheerio.CheerioAPI,
  head: cheerio.Cheerio<any>,
  attrs: { property?: string; itemprop?: string; content?: string | number | null }
): void {
  if (attrs.content === undefined || attrs.content === null) return;
  const contentStr = String(attrs.content).trim();
  if (!contentStr) return;

  if (attrs.property && $(`meta[property="${attrs.property}"]`).length === 0) {
    const meta = $('<meta />').attr('property', attrs.property).attr('content', contentStr);
    if (attrs.itemprop && $(`meta[itemprop="${attrs.itemprop}"]`).length === 0) {
      meta.attr('itemprop', attrs.itemprop);
    }
    head.append(meta);
    return;
  }

  if (attrs.itemprop && $(`meta[itemprop="${attrs.itemprop}"]`).length === 0) {
    const meta = $('<meta />').attr('itemprop', attrs.itemprop).attr('content', contentStr);
    head.append(meta);
  }
}

function collectJsonLdNodes(data: unknown, results: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return results;

  if (Array.isArray(data)) {
    for (const item of data) {
      collectJsonLdNodes(item, results);
    }
    return results;
  }

  const obj = data as Record<string, unknown>;
  results.push(obj);

  if (Array.isArray(obj['@graph'])) {
    collectJsonLdNodes(obj['@graph'], results);
  }

  return results;
}

function selectPrimaryOffer(offersRaw: unknown): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = [];
  if (Array.isArray(offersRaw)) {
    for (const item of offersRaw) {
      if (item && typeof item === 'object') {
        candidates.push(item as Record<string, unknown>);
      }
    }
  } else if (offersRaw && typeof offersRaw === 'object') {
    const offerObj = offersRaw as Record<string, unknown>;
    if (Array.isArray(offerObj.offers)) {
      return selectPrimaryOffer(offerObj.offers) ?? offerObj;
    }
    candidates.push(offerObj);
  }

  if (candidates.length === 0) return null;

  // Prefer an in-stock offer with a positive numeric price
  for (const offer of candidates) {
    const rawPrice = offer.price ?? offer.lowPrice ?? offer.highPrice;
    const numericPrice = rawPrice !== undefined ? Number(rawPrice) : NaN;
    if (!Number.isNaN(numericPrice) && numericPrice > 0) {
      return offer;
    }
  }

  return candidates[0] ?? null;
}

/**
 * Extracts structured Schema.org JSON-LD (`application/ld+json`) data from `<script>` tags
 * and projects key product/article fields into semantic `<meta>` tags in `<head>` so they remain
 * queryable by standard CSS selectors even after `<script>` tags are stripped.
 */
export function projectStructuredDataToMeta($: cheerio.CheerioAPI): void {
  const scripts = $('script[type="application/ld+json"]');
  if (scripts.length === 0) return;

  let head = $('head').first();
  if (head.length === 0) {
    const htmlEl = $('html').first();
    if (htmlEl.length > 0) {
      htmlEl.prepend('<head></head>');
      head = $('head').first();
    } else {
      return;
    }
  }

  scripts.each((_, el) => {
    const rawJson = $(el).html()?.trim();
    if (!rawJson) return;

    try {
      const parsed = JSON.parse(rawJson);
      const nodes = collectJsonLdNodes(parsed);

      for (const node of nodes) {
        const rawType = node['@type'];
        const types = Array.isArray(rawType)
          ? rawType.map((t) => String(t).toLowerCase())
          : rawType
            ? [String(rawType).toLowerCase()]
            : [];

        const isProductOrCreative =
          types.some((t) =>
            ['product', 'offer', 'aggregateoffer', 'article', 'newsarticle', 'blogposting', 'softwareapplication', 'book', 'course', 'event'].includes(t)
          ) || Boolean(node.offers);

        if (!isProductOrCreative) continue;

        const name = (node.name ?? node.headline) as string | undefined;
        if (typeof name === 'string' && name.trim()) {
          appendMetaIfMissing($, head, { property: 'og:title', itemprop: 'name', content: name });
        }

        if (typeof node.description === 'string' && node.description.trim()) {
          appendMetaIfMissing($, head, { itemprop: 'description', content: node.description });
        }

        if (typeof node.sku === 'string' || typeof node.sku === 'number') {
          appendMetaIfMissing($, head, { itemprop: 'sku', content: node.sku });
        }

        const brand = node.brand;
        if (typeof brand === 'string') {
          appendMetaIfMissing($, head, { property: 'product:brand', itemprop: 'brand', content: brand });
        } else if (brand && typeof brand === 'object' && typeof (brand as Record<string, unknown>).name === 'string') {
          appendMetaIfMissing($, head, {
            property: 'product:brand',
            itemprop: 'brand',
            content: (brand as Record<string, unknown>).name as string,
          });
        }

        const offer = selectPrimaryOffer(node.offers ?? (types.includes('offer') ? node : null));
        if (offer) {
          const price = (offer.price ?? offer.lowPrice) as string | number | undefined;
          if (price !== undefined && price !== null && String(price).trim() !== '') {
            appendMetaIfMissing($, head, {
              property: 'product:price:amount',
              itemprop: 'price',
              content: price,
            });
          }

          if (typeof offer.priceCurrency === 'string') {
            appendMetaIfMissing($, head, {
              property: 'product:price:currency',
              itemprop: 'priceCurrency',
              content: offer.priceCurrency,
            });
          }

          if (typeof offer.availability === 'string') {
            const cleanAvail = offer.availability.replace(/^https?:\/\/schema\.org\//i, '');
            appendMetaIfMissing($, head, {
              property: 'product:availability',
              itemprop: 'availability',
              content: cleanAvail,
            });
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  });
}

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
 * 1. Projects structured Schema.org JSON-LD fields into semantic `<meta>` tags, then strips `<script>`, `<style>`, `<svg>`, etc.
 * 2. Preserves semantic content `<meta>` tags (OpenGraph, Product, Schema itemprop) while stripping noisy browser/verification meta tags.
 * 3. Strips telemetry/tracking attributes and base64 inline images (data:image/*).
 * 4. Prunes repetitive sibling nodes inside <ul>, <ol>, <tbody> to keep at most 3 sample nodes.
 */
export function sanitizeHtml(rawHtml: string, maxRepetitiveSamples = 3): string {
  const $ = cheerio.load(rawHtml);

  // 1. Project structured JSON-LD data into semantic <meta> tags before stripping scripts
  projectStructuredDataToMeta($);

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

