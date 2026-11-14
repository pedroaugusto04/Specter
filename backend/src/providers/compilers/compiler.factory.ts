import { env } from '../../config/env.js';
import { AgyCliCompilerProvider } from './agyCliCompiler.provider.js';
import { CodexCompilerProvider } from './codexCompiler.provider.js';
import { GeminiApiCompilerProvider } from './geminiApiCompiler.provider.js';

export function createCompilerProvider(
  providerName: 'agy' | 'codex' | 'api' = env.COMPILER_PROVIDER,
  options?: { model?: string }
) {
  switch (providerName) {
    case 'api':
      return new GeminiApiCompilerProvider(options);
    case 'codex':
      return new CodexCompilerProvider(options);
    case 'agy':
    default:
      return new AgyCliCompilerProvider(options);
  }
}
