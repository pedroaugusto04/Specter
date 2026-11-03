import { env } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';

export type { CliCompilerOptions } from './cliCompiler.provider.js';

export class AgyCliCompilerProvider extends CliCompilerProvider {
  constructor(options: CliCompilerOptions = {}) {
    super({ ...options, providerName: 'agy', cliCommand: options.cliCommand ?? env.AGY_CLI_PATH });
  }
}
