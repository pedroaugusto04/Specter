import { env } from '../../config/env.js';
import { AgyCliCompilerProvider } from './agyCliCompiler.provider.js';
import { CodexCompilerProvider } from './codexCompiler.provider.js';
import { GeminiApiCompilerProvider } from './geminiApiCompiler.provider.js';

export function createCompilerProvider(providerName: 'agy' | 'codex' | 'api' = env.COMPILER_PROVIDER) {
  switch (providerName) {
    case 'api':
      return new GeminiApiCompilerProvider();
    case 'codex':
      return new CodexCompilerProvider();
    case 'agy':
    default:
      return new AgyCliCompilerProvider();
  }
}
