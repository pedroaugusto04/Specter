import { MODEL_SYSTEM_INSTRUCTIONS } from './compilerPrompt.js';
import type { IModelProvider, ModelInput } from '../../extraction/model.js';
import { env } from '../../config/env.js';
import { parseRetryAfter, parseRetryInfo } from '../../utils/retryAfter.js';
import {
  CompilerApiRequestError,
  CompilerTimeoutError,
  CompilerValidationError,
} from '../../errors/domainErrors.js';
import { getLangfuse } from '../langfuse.js';

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
    const startTime = new Date();
    const langfuse = getLangfuse();
    const trace = langfuse?.trace({
      name: 'specter:compiler:gemini',
      sessionId: input.jobId ? `job:${input.jobId}` : undefined,
      userId: 'specter-compiler',
      tags: ['specter', 'compilation', input.task || 'extract'],
      input: { task: input.task, instructions: input.instructions },
      metadata: { model: this.model, jobId: input.jobId },
    });
    const generation = trace?.generation({
      name: 'gemini-compile',
      model: this.model,
      input: { task: input.task, instructions: input.instructions },
      startTime,
    });

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
          maxOutputTokens: env.COMPILER_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseJsonSchema: input.outputSchema,
        },
      }),
      signal: AbortSignal.any([
        AbortSignal.timeout(timeoutMs),
        ...(input.signal ? [input.signal] : []),
      ]),
    };
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.fetchFn(url, init);
      } catch (error) {
        if (init.signal?.aborted) {
          generation?.end({ output: { error: 'cancelled_or_timeout' }, level: 'ERROR' });
          throw new CompilerTimeoutError('Model request cancelled or timed out', error);
        }
        if (attempt >= env.COMPILER_API_MAX_RETRIES) {
          generation?.end({ output: { error: String(error) }, level: 'ERROR' });
          if (error instanceof Error && error.name === 'TimeoutError')
            throw new CompilerTimeoutError('Gemini API request timed out', error);
          throw new CompilerApiRequestError(undefined, error);
        }
        await this.waitBeforeRetry(attempt, undefined, init.signal ?? undefined);
        continue;
      }
      if (response.status === 429) break;
      if (response.status !== 408 && response.status < 500) break;
      if (attempt >= env.COMPILER_API_MAX_RETRIES) break;
      const retryAfter = response.headers.get('retry-after');
      await this.waitBeforeRetry(attempt, retryAfter, init.signal ?? undefined);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const errorText = body.replace(/\s+/g, ' ').trim().slice(0, 300);
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      const retryInfo = response.status === 429 ? parseRetryInfo(body) : undefined;
      generation?.end({
        output: errorText,
        level: 'ERROR',
        statusMessage: `HTTP ${response.status}`,
      });
      throw new CompilerApiRequestError(
        response.status,
        undefined,
        `HTTP ${response.status}${errorText ? ` - ${errorText}` : ''}`,
        response.status === 429 ? Math.max(retryAfter ?? 0, retryInfo ?? 0) : undefined
      );
    }

    let data: GeminiResponse;
    try {
      data = (await response.json()) as GeminiResponse;
    } catch (error) {
      generation?.end({ output: { error: 'invalid_json_response' }, level: 'ERROR' });
      throw new CompilerValidationError('Gemini API returned an invalid response', error);
    }

    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason === 'MAX_TOKENS') {
      generation?.end({ output: { error: 'incomplete_result' }, level: 'ERROR' });
      throw new CompilerValidationError('Gemini API did not return a complete result');
    }
    const output = candidate.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();
    if (output && output.length > env.COMPILER_MAX_OUTPUT_CHARS) {
      generation?.end({ output: { error: 'size_limit_exceeded' }, level: 'ERROR' });
      throw new CompilerValidationError('Model output exceeds the configured size limit.');
    }
    if (!output) {
      generation?.end({ output: { error: 'empty_result' }, level: 'ERROR' });
      throw new CompilerValidationError('Gemini API returned an empty result');
    }

    try {
      const parsed = JSON.parse(output) as unknown;
      generation?.end({ output: parsed });
      trace?.update({ output: parsed });
      return parsed;
    } catch (error) {
      generation?.end({ output: { error: 'output_not_valid_json' }, level: 'ERROR' });
      throw new CompilerValidationError('Gemini API result was not valid JSON', error);
    }
  }

  private async waitBeforeRetry(
    attempt: number,
    retryAfter?: string | null,
    signal?: AbortSignal
  ): Promise<void> {
    const retryAfterMs = parseRetryAfter(retryAfter ?? null);
    const exponential = Math.min(
      env.COMPILER_API_RETRY_BASE_DELAY_MS * 2 ** attempt,
      env.COMPILER_API_RETRY_MAX_DELAY_MS
    );
    const delay =
      retryAfterMs !== undefined
        ? Math.min(retryAfterMs, env.COMPILER_API_RETRY_MAX_DELAY_MS)
        : exponential;
    const jittered = Math.floor(delay * (0.8 + Math.random() * 0.4));
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(new CompilerTimeoutError('Model retry deadline exhausted.'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, jittered);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}
