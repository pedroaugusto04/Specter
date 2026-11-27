import { env } from '../../config/env.js';
import {
  CompilerApiRequestError,
  CompilerOutputTooLargeError,
  CompilerTimeoutError,
  CompilerValidationError,
} from '../../errors/domainErrors.js';
import type { IModelProvider, ModelInput } from '../../extraction/model.js';
import { parseRetryAfter, parseRetryInfo } from '../../utils/retryAfter.js';
import { getLangfuse, resolveManagedPrompt } from '../langfuse.js';
import { MODEL_SYSTEM_INSTRUCTIONS } from './compilerPrompt.js';

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
    const { text: promptText, promptClient } = await resolveManagedPrompt(
      'specter-compiler',
      MODEL_SYSTEM_INSTRUCTIONS
    );

    const trace = langfuse?.trace({
      name: 'specter:compiler:gemini',
      sessionId: input.jobId ? `job:${input.jobId}` : undefined,
      userId: 'specter-compiler',
      tags: ['specter', 'compilation', input.task],
      input: { task: input.task, instructions: input.instructions },
      metadata: {
        model: this.model,
        jobId: input.jobId,
        task: input.task,
      },
    });
    const generation = trace?.generation({
      name: 'gemini-compile',
      model: this.model,
      prompt: promptClient,
      input: {
        task: input.task,
        instructions: input.instructions,
        systemInstruction: promptText,
      },
      startTime,
    });

    const recordScore = (name: string, value: number, comment: string) => {
      if (langfuse && trace) {
        langfuse.score({ traceId: trace.id, name, value, comment });
      }
    };

    const signal = AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...(input.signal ? [input.signal] : []),
    ]);

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
          parts: [{ text: promptText }],
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
      signal,
    };

    let attempt = 0;
    for (; ; attempt++) {
      try {
        response = await this.fetchFn(url, init);
      } catch (error) {
        if (signal.aborted) {
          generation?.end({ output: { error: 'cancelled_or_timeout' }, level: 'ERROR' });
          throw new CompilerTimeoutError('Model request cancelled or timed out', error);
        }
        if (attempt >= env.COMPILER_API_MAX_RETRIES) {
          generation?.end({ output: { error: String(error) }, level: 'ERROR' });
          if (error instanceof Error && error.name === 'TimeoutError') {
            throw new CompilerTimeoutError('Gemini API request timed out', error);
          }
          throw new CompilerApiRequestError(undefined, error);
        }
        await this.waitBeforeRetry(attempt, undefined, signal);
        continue;
      }
      if (response.status === 429) break;
      if (response.status !== 408 && response.status < 500) break;
      if (attempt >= env.COMPILER_API_MAX_RETRIES) break;
      await this.waitBeforeRetry(attempt, response.headers.get('retry-after'), signal);
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

    recordScore(
      'retry_count',
      attempt,
      attempt === 0 ? 'Succeeded on first attempt' : `Required ${attempt} retries`
    );

    let data: GeminiResponse;
    try {
      data = (await response.json()) as GeminiResponse;
    } catch (error) {
      generation?.end({ output: { error: 'invalid_json_response' }, level: 'ERROR' });
      recordScore('schema_valid', 0, 'Gemini API returned an invalid response');
      throw new CompilerValidationError('Gemini API returned an invalid response', error);
    }

    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    recordScore(
      'finish_reason_stop',
      finishReason === 'STOP' ? 1 : 0,
      `finishReason: ${finishReason || 'unknown'}`
    );

    if (!candidate || candidate.finishReason === 'MAX_TOKENS') {
      generation?.end({ output: { error: 'incomplete_result' }, level: 'ERROR' });
      recordScore('schema_valid', 0, 'Incomplete result (MAX_TOKENS or missing candidate)');
      throw new CompilerValidationError('Gemini API did not return a complete result');
    }

    const output = candidate.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (output && output.length > env.COMPILER_MAX_OUTPUT_CHARS) {
      generation?.end({ output: { error: 'size_limit_exceeded' }, level: 'ERROR' });
      recordScore(
        'output_size_valid',
        0,
        `Model output exceeds configured size limit (${output.length} > ${env.COMPILER_MAX_OUTPUT_CHARS})`
      );
      throw new CompilerOutputTooLargeError();
    }

    if (!output) {
      generation?.end({ output: { error: 'empty_result' }, level: 'ERROR' });
      recordScore('schema_valid', 0, 'Gemini API returned an empty result');
      throw new CompilerValidationError('Gemini API returned an empty result');
    }

    recordScore('output_size_valid', 1, `Model output size: ${output.length} characters`);

    try {
      const parsed = JSON.parse(output) as unknown;
      generation?.end({ output: parsed });
      trace?.update({ output: parsed });
      this.scoreParsedOutput(recordScore, input.task, parsed);
      return parsed;
    } catch (error) {
      generation?.end({ output: { error: 'output_not_valid_json' }, level: 'ERROR' });
      recordScore('schema_valid', 0, 'Gemini API result was not valid JSON');
      throw new CompilerValidationError('Gemini API result was not valid JSON', error);
    }
  }

  private scoreParsedOutput(
    recordScore: (name: string, value: number, comment: string) => void,
    task: ModelInput['task'],
    parsed: unknown
  ): void {
    recordScore('schema_valid', 1, 'Valid JSON output from Gemini');
    const record =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const isNonEmpty = Boolean(record && Object.keys(record).length > 0);
    recordScore(
      'non_empty_result',
      isNonEmpty ? 1 : 0,
      isNonEmpty ? 'Structured output contains data' : 'Output was empty or null'
    );

    if (!record) return;

    if (task === 'semantic' && 'score' in record) {
      const semanticScore = Number(record.score);
      if (!Number.isNaN(semanticScore)) {
        const reasons = Array.isArray(record.reasons)
          ? record.reasons.slice(0, 3).map(String).join('; ')
          : '';
        recordScore(
          'semantic_score',
          semanticScore,
          `Semantic review score (0-10): ${reasons}`.slice(0, 300)
        );
      }
    } else if (task === 'configure' && 'kind' in record) {
      const isCandidate = record.kind === 'candidate';
      recordScore(
        'decision_kind',
        isCandidate ? 1 : 0,
        `Decision: ${String(record.kind)} (${isCandidate ? 'Full Plan' : 'Tool Observation'})`
      );
    } else if (task === 'diagnostic' && 'issue' in record) {
      recordScore('diagnostic_resolved', 1, 'Diagnostic generated for user');
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
