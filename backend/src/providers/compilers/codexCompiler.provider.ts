import { env } from '../../config/env.js';
import { CompilerValidationError } from '../../errors/domainErrors.js';
import { logger } from '../../utils/logger.js';
import { AgyCliCompilerProvider, type CliCompilerOptions } from './agyCliCompiler.provider.js';
import type { CompilerInput, ExtractorSchema, ICompilerProvider } from './compiler.interface.js';

export interface CodexCompilerOptions extends CliCompilerOptions {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
}

/**
 * Concrete adapter for Codex / OpenAI compilation.
 * Supports either OpenAI HTTP API (when OPENAI_API_KEY is present) or local Codex CLI subprocess.
 */
export class CodexCompilerProvider implements ICompilerProvider {
  public readonly name = 'codex';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly cliFallback: AgyCliCompilerProvider;

  constructor(options: CodexCompilerOptions = {}) {
    this.apiKey = options.apiKey ?? env.OPENAI_API_KEY;
    this.model = options.model ?? env.OPENAI_MODEL;
    this.timeoutMs = options.timeoutMs ?? env.COMPILER_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? fetch;
    this.cliFallback = new AgyCliCompilerProvider({
      ...options,
      cliCommand: options.cliCommand ?? env.CODEX_CLI_PATH,
      cliArgsBuilder:
        options.cliArgsBuilder ??
        ((promptFile: string) => ['--quiet', '--prompt-file', promptFile]),
    });
  }

  async compile(input: CompilerInput): Promise<ExtractorSchema> {
    if (!this.apiKey) {
      return this.cliFallback.compile(input);
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a web selector compiler. Analyze the provided sanitized HTML and user request, and output ONLY a JSON object matching {"containerSelector"?: string, "fields": Record<string, {"selector": string, "fallbackSelectors"?: string[], "attribute"?: "text"|"href"|"src"|"content", "type"?: "string"|"number"|"boolean"}>, "triggerRules"?: Array<{"field": string, "operator": "lt"|"lte"|"gt"|"gte"|"eq"|"neq"|"contains"|"not_contains"|"percentage_drop"|"percentage_increase"|"decreased"|"increased"|"changes", "value": string|number|boolean}>, "triggerMatchMode"?: "any"|"all"}. Selector Strategy: For primary "selector", always target visible <body> elements (h1, [data-testid], [itemprop]) or text label anchors (e.g. p:contains("Starting at") + p), selecting the specific leaf element holding the value rather than parent containers that concatenate multiple prices/installments. When classes use CSS Modules with build hashes (e.g. "ProductPrice_productPrice__vpgdo"), NEVER hardcode the volatile hash suffix; use attribute substring matchers on the semantic prefix (e.g. "[class*=\'ProductPrice_productPrice\']"). Provide 1-3 resilient alternative fallbackSelectors in descending priority order, combining alternative <body> selectors with semantic <meta> fallbacks when present in <head> (e.g. "meta[property=\'product:price:amount\']", "meta[itemprop=\'price\']", "meta[property=\'og:title\']"). NEVER select temporary skeleton loaders, spinners, or loading placeholder containers. NEVER select the document <title> tag. If the user request mentions alert conditions or thresholds (e.g., price < 3500, in stock, discount > 20%, drops by 10%), infer the corresponding triggerRules for the extracted fields. If no conditions are mentioned, omit triggerRules. If the page appears to be a security challenge, captcha, account verification, or access denied screen, output an empty fields object {}.',
            },
            {
              role: 'user',
              content: `User request: "${input.userPrompt}"\n\nSanitized HTML:\n${input.sanitizedHtml}`,
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new CompilerValidationError(`Codex/OpenAI API returned HTTP ${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = body.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new CompilerValidationError('Codex/OpenAI response contained no message content.');
      }

      const parsed = JSON.parse(rawContent) as ExtractorSchema;
      if (!parsed || typeof parsed !== 'object' || !parsed.fields) {
        throw new CompilerValidationError(
          'Codex/OpenAI JSON output is missing required "fields" property.'
        );
      }

      logger.info('Codex provider compiled extractor schema', {
        jobId: input.jobId,
        provider: this.name,
        durationMs: Date.now() - startTime,
      });

      return parsed;
    } catch (error) {
      if (error instanceof CompilerValidationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new CompilerValidationError(`Codex/OpenAI compilation failed: ${message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
