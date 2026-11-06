import { MODEL_SYSTEM_INSTRUCTIONS } from './compilerPrompt.js';
import type { IModelProvider, ModelInput } from '../../extraction/model.js';
import { env } from '../../config/env.js';
import {
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
} from '../../errors/domainErrors.js';

export interface GeminiApiCompilerOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

export class GeminiApiCompilerProvider implements IModelProvider {
  readonly name = 'gemini-api';
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: GeminiApiCompilerOptions = {}) {
    this.model = options.model ?? env.COMPILER_API_MODEL;
    this.apiKey = options.apiKey ?? env.COMPILER_API_KEY;
    this.baseUrl = (options.baseUrl ?? env.COMPILER_API_BASE_URL).replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generate(input: ModelInput): Promise<unknown> {
    const timeoutMs = Math.min(input.timeoutMs, env.COMPILER_TIMEOUT_MS);
    let response: Response;
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: MODEL_SYSTEM_INSTRUCTIONS,
            },
          ],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Task (${input.task}):\n${input.instructions}` },
              { text: `Untrusted evidence:\n${input.evidence}` },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: input.outputSchema,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    };
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.fetchFn(url, init);
      } catch (error) {
        if (attempt >= env.COMPILER_API_MAX_RETRIES) {
          if (error instanceof Error && error.name === 'TimeoutError')
            throw new CompilerTimeoutError('Gemini API request timed out', error);
          throw new CompilerApiRequestError(undefined, error);
        }
        await this.waitBeforeRetry(attempt);
        continue;
      }
      if (![408, 429].includes(response.status) && response.status < 500) break;
      if (attempt >= env.COMPILER_API_MAX_RETRIES) break;
      const retryAfter = response.headers.get('retry-after');
      await this.waitBeforeRetry(attempt, retryAfter);
    }

    if (!response.ok) {
      const errorText = await response
        .text()
        .then((text) => text.replace(/\s+/g, ' ').trim().slice(0, 300))
        .catch(() => '');
      throw new CompilerApiRequestError(
        response.status,
        undefined,
        `HTTP ${response.status}${errorText ? ` - ${errorText}` : ''}`
      );
    }

    let data: GeminiResponse;
    try {
      data = (await response.json()) as GeminiResponse;
    } catch (error) {
      throw new CompilerValidationError('Gemini API returned an invalid response', error);
    }

    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason === 'MAX_TOKENS')
      throw new CompilerValidationError('Gemini API did not return a complete result');
    const output = candidate.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!output) throw new CompilerValidationError('Gemini API returned an empty result');

    try {
      return JSON.parse(output) as unknown;
    } catch (error) {
      throw new CompilerValidationError('Gemini API result was not valid JSON', error);
    }
  }

  private async waitBeforeRetry(attempt: number, retryAfter?: string | null): Promise<void> {
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
    const exponential = Math.min(
      env.COMPILER_API_RETRY_BASE_DELAY_MS * 2 ** attempt,
      env.COMPILER_API_RETRY_MAX_DELAY_MS
    );
    const delay =
      Number.isFinite(retryAfterMs) && retryAfterMs >= 0
        ? Math.min(retryAfterMs, env.COMPILER_API_RETRY_MAX_DELAY_MS)
        : exponential;
    const jittered = Math.floor(delay * (0.8 + Math.random() * 0.4));
    await new Promise((resolve) => setTimeout(resolve, jittered));
  }
}
