import type { ExtractorSchema } from '../../types/extractor.js';
import { buildCliCompilerPrompt, COMPILER_SYSTEM_INSTRUCTIONS } from './compilerPrompt.js';

export type { ExtractorSchema } from '../../types/extractor.js';
export { buildCliCompilerPrompt, COMPILER_SYSTEM_INSTRUCTIONS };

export interface CompilerInput {
  jobId: string;
  sanitizedHtml: string;
  userPrompt: string;
}

export interface ICompilerProvider {
  readonly name: string;
  compile(input: CompilerInput): Promise<ExtractorSchema>;
}

export const buildCompilerPrompt = buildCliCompilerPrompt;
