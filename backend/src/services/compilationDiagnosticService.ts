import { z } from 'zod';
import type { IModelProvider } from '../extraction/model.js';
import { ModelTask } from '../extraction/configurationConstants.js';
import { logger } from '../utils/logger.js';

export interface DiagnosticInput {
  jobId: string;
  url: string;
  userPrompt: string;
  failureReason?: string;
  signal?: AbortSignal;
}

export interface DiagnosticResult {
  issue: string;
  nextSteps: string;
}

export const diagnosticOutputSchema = z.object({
  issue: z.string().trim().min(5),
  nextSteps: z.string().trim().min(5),
});

const DIAGNOSTIC_INSTRUCTIONS = `
You are a helpful and concise support assistant for a web monitoring tool.
A user attempted to set up a monitor, but the automated setup could not be completed based on their instructions and the target page.

Task:
Explain what went wrong in plain language and provide a clear, actionable next step that the user can take to fix it (such as updating their prompt, adjusting the URL, selecting a specific variant, or connecting a session).

Strict Guidelines:
1. Audience: General users. Keep the tone helpful, objective, and concise (maximum 2 sentences per field).
2. NO TECHNICAL JARGON: Never mention HTML, DOM, CSS, selectors, XPath, regex, parsing, scrapers, APIs, HTTP status codes, or code.
3. Action-oriented: Focus exclusively on what the user can see on the page and what they can change in their instructions or URL.
4. Output Format: Return strictly a valid JSON object matching the requested schema.
`.trim();

export class CompilationDiagnosticService {
  constructor(private readonly modelProvider: IModelProvider) {}

  async diagnose(input: DiagnosticInput): Promise<DiagnosticResult | null> {
    const started = Date.now();
    try {
      const timeoutMs = 12000;
      const evidence = JSON.stringify({
        userPrompt: input.userPrompt,
        pageUrl: input.url,
        failureContext:
          input.failureReason || 'Selectors could not be resolved reliably for the requested data.',
      });

      const { $schema: _schemaVersion, ...outputSchema } = z.toJSONSchema(diagnosticOutputSchema, {
        target: 'draft-07',
        io: 'input',
      });

      const output = await this.modelProvider.generate({
        jobId: input.jobId,
        task: ModelTask.Diagnostic,
        instructions: DIAGNOSTIC_INSTRUCTIONS,
        outputSchema: outputSchema as Record<string, unknown>,
        evidence,
        timeoutMs,
        signal: input.signal,
      });

      const parsed = diagnosticOutputSchema.safeParse(output);
      if (parsed.success) {
        logger.info('Compilation diagnostic generated successfully', {
          jobId: input.jobId,
          durationMs: Date.now() - started,
        });
        return parsed.data;
      }

      logger.warn('Diagnostic output schema validation failed', {
        jobId: input.jobId,
        output,
        durationMs: Date.now() - started,
      });
      return null;
    } catch (error) {
      logger.warn('Diagnostic generation skipped or failed', {
        jobId: input.jobId,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
