import type { ExtractionPlan } from '../../types/extractionPlan.js';
import { buildCliCompilerPrompt, COMPILER_SYSTEM_INSTRUCTIONS } from './compilerPrompt.js';

export type { ExtractionPlan } from '../../types/extractionPlan.js';
export { buildCliCompilerPrompt, COMPILER_SYSTEM_INSTRUCTIONS };

export interface CompilerInput {
  timeoutMs?: number;
  jobId: string;
  sanitizedHtml: string;
  userPrompt: string;
}

export interface ICompilerProvider {
  readonly name: string;
  compile(input: CompilerInput): Promise<ExtractionPlan>;
}
