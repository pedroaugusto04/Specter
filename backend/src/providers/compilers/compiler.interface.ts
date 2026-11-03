import type { ExtractorSchema } from '../../types/extractor.js';

export type { ExtractorSchema } from '../../types/extractor.js';

export interface CompilerInput {
  jobId: string;
  sanitizedHtml: string;
  userPrompt: string;
  existingFieldKeys?: string[];
}

export interface ICompilerProvider {
  readonly name: string;
  compile(input: CompilerInput): Promise<ExtractorSchema>;
}

export function buildCompilerPrompt(
  domFilePath: string,
  outputFilePath: string,
  userPrompt: string,
  existingFieldKeys?: string[]
): string {
  const preservationRule =
    existingFieldKeys && existingFieldKeys.length > 0
      ? `\n- Schema Preservation: This is an existing job being re-compiled/healed. You MUST preserve the exact existing field keys: [${existingFieldKeys.join(', ')}]. Update their selectors to match the new DOM, but DO NOT rename, translate, or remove any of these keys.\n`
      : '';

  return `You are a web selector compiler.
Analyze the file '${domFilePath}' and satisfy the user's request: "${userPrompt}".
MANDATORY: Save the output strictly in valid JSON format at the path '${outputFilePath}'.
Do not output text in the terminal. Do not request interactive confirmation.

Field Naming Strategy:
- Always use standard canonical English lower_snake_case identifiers for keys in "fields" (e.g. 'title', 'price', 'original_price', 'discount', 'stock_status', 'description', 'rating', 'author', 'url', 'image').
- Even if the user prompt is in Portuguese, Spanish, or another language (e.g. "preço e título"), ALWAYS name the field keys in standard canonical English ('price', 'title') so the JSON schema remains deterministic across compilations.${preservationRule}
Selector Strategy:
- Primary 'selector': Prefer canonical entity elements (e.g., 'h1', '[itemprop="name"]', primary product/article heading) over navigation elements. Never use breadcrumbs, navigation menus, or category tags as the primary title/name selector; reserve navigation elements strictly as a last-resort fallback. Target the specific leaf element holding the value rather than parent containers that concatenate multiple prices/installments.
- CSS Modules & Hashed Classes: When elements use CSS Modules with build hashes (e.g. "ProductPrice_productPrice__vpgdo" or "ProductInfoCenter_title__hdTX_"), NEVER hardcode the volatile hash suffix; use attribute substring selectors on the semantic prefix (e.g. '[class*="ProductPrice_productPrice"]', 'h1[class*="ProductInfoCenter_title"]').
- 'fallbackSelectors': Provide 1-3 resilient alternative selectors in descending priority order, combining alternative <body> selectors (e.g. 'h1', '.font-mono.text-2xl') with semantic <meta> fallbacks when present in <head> (e.g. 'meta[property="product:price:amount"]', 'meta[itemprop="price"]', 'meta[property="og:title"]', 'meta[itemprop="name"]').
- Fallback Consistency: Fallback selectors must represent the same semantic data format as the primary selector. Avoid mixing clean body text with <meta> tags that append site branding/suffixes (e.g. ' | SiteName') unless no clean body alternative exists.
- Clean Target: Never select <title>, and never rely on <head> tags alone if <body> has no matching content. Never select temporary loading/skeleton placeholders (classes containing 'skeleton', 'loading', or aria-busy="true").
- Security: If the page is a security challenge, captcha, or access denied screen, output an empty fields object {}.
- Attributes: Use attribute "href" for links, "src" for images, "text" for text content (note: <meta> fallback selectors automatically resolve their "content" attribute even when attribute is "text").

Trigger Rule Guidelines:
- If the user prompt expresses alert conditions, thresholds, or filtering requirements (e.g., "alert only if price is under 3500", "only if in stock", "alert when discount > 20%", "notify if price drops by 10%", "notify if status changes"):
  1. Define the necessary field in the "fields" map (e.g. "price", "stock_status", "discount").
  2. Add corresponding condition(s) to "triggerRules".
  3. Supported operators:
     - Fixed Numeric: "lt" (<), "lte" (<=), "gt" (>), "gte" (>=), "eq" (==), "neq" (!=)
     - Relative changes: "percentage_drop" (drops by X% or more), "percentage_increase" (increases by X% or more), "decreased" (price decreased), "increased" (price increased), "changes" (any change in value or text)
     - Text / Boolean: "eq", "neq", "contains", "not_contains", "changes"
  4. Set "triggerMatchMode" to "all" (if all conditions must hold) or "any" (if any condition can trigger). Default is "all".
- If no conditions or thresholds are requested, omit "triggerRules" or supply an empty array [].

Expected format:
{
  "containerSelector": "optional_css_selector_for_repeating_items",
  "fields": {
    "price": {
      "selector": "p:contains('Starting at') + p",
      "fallbackSelectors": [".font-mono.text-2xl"],
      "attribute": "text",
      "type": "number"
    },
    "link": { "selector": "a.detail", "attribute": "href" }
  },
  "triggerRules": [
    { "field": "price", "operator": "lt", "value": 3500 }
  ],
  "triggerMatchMode": "all"
}`;
}
