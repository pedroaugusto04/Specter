import { env } from '../../config/env.js';
import { AgyCliCompilerProvider } from './agyCliCompiler.provider.js';
import { CodexCompilerProvider } from './codexCompiler.provider.js';

export function createCompilerProvider(providerName: 'agy' | 'codex' = env.COMPILER_PROVIDER) {
  switch (providerName) {
    case 'codex':
      return new CodexCompilerProvider();
    case 'agy':
    default:
      return new AgyCliCompilerProvider();
  }
}
