import { env } from '../../config/env.js';
import { CompilerTimeoutError, CompilerValidationError } from '../../errors/domainErrors.js';
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
        options.cliArgsBuilder ?? ((promptFile: string) => ['--quiet', '--prompt-file', promptFile]),
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
                'You are a web selector compiler. Analyze the provided sanitized HTML and user request, and output ONLY a JSON object matching {"containerSelector"?: string, "fields": Record<string, {"selector": string, "attribute"?: "text"|"href"|"src", "type"?: "string"|"number"|"boolean"}>}. Prefer stable selectors like data-testid, semantic IDs, and HTML5 tags.',
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
        throw new CompilerValidationError(
          `Codex/OpenAI API returned HTTP ${response.status}`
        );
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new CompilerTimeoutError(
          `Codex compilation timed out after ${this.timeoutMs}ms`,
          err
        );
      }
      if (err instanceof CompilerValidationError || err instanceof CompilerTimeoutError) {
        throw err;
      }
      throw new CompilerValidationError(
        `Codex compilation failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
