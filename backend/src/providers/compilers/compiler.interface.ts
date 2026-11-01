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

export function buildCompilerPrompt(domFilePath: string, outputFilePath: string, userPrompt: string): string {
  return `You are a web selector compiler.
Analyze the file '${domFilePath}' and satisfy the user's request: "${userPrompt}".
MANDATORY: Save the output strictly in valid JSON format at the path '${outputFilePath}'.
Do not output text in the terminal. Do not request interactive confirmation.

Selector Guidelines:
- Avoid obfuscated dynamic classes (hashes from Tailwind or Styled Components).
- Prioritize 'data-testid', semantic IDs, stable hierarchies, and standard HTML5 tags.
- To extract links use attribute "href"; for images use "src"; for text use "text".

Expected format:
{
  "containerSelector": "optional_css_selector_for_repeating_items",
  "fields": {
    "field1": { "selector": "css_or_xpath_selector", "attribute": "text" },
    "link": { "selector": "a.detail", "attribute": "href" }
  }
}`;
}
