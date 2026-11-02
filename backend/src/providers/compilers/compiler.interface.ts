import type { ExtractorSchema } from '../../types/extractor.js';

export type { ExtractorSchema } from '../../types/extractor.js';

export interface CompilerInput {
  jobId: string;
  sanitizedHtml: string;
  userPrompt: string;
}

export interface ICompilerProvider {
  readonly name: string;
  compile(input: CompilerInput): Promise<ExtractorSchema>;
}

export function buildCompilerPrompt(
  domFilePath: string,
  outputFilePath: string,
  userPrompt: string
): string {
  return `You are a web selector compiler.
Analyze the file '${domFilePath}' and satisfy the user's request: "${userPrompt}".
MANDATORY: Save the output strictly in valid JSON format at the path '${outputFilePath}'.
Do not output text in the terminal. Do not request interactive confirmation.

Selector Strategy:
- Primary 'selector': Prefer semantic attributes (id, data-testid, itemprop) or text label anchors (e.g. p:contains("Starting at") + p).
- 'fallbackSelectors': Provide 1-2 resilient alternative selectors in descending priority order (e.g. readable utility classes like font-mono, text-2xl or structural path).
- Classes: Use readable, semantic, or utility class names. Avoid only random compiler-generated hashes (e.g. css-1a2b3c, _3kP9x).
- Clean Target: Never select <title>, <head>, or temporary loading/skeleton placeholders (classes containing 'skeleton', 'loading', or aria-busy="true").
- Security: If the page is a security challenge, captcha, or access denied screen, output an empty fields object {}.
- Attributes: Use attribute "href" for links, "src" for images, "text" for text content.

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
