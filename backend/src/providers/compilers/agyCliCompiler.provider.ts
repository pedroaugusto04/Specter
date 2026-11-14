import { env } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';

export type { CliCompilerOptions } from './cliCompiler.provider.js';

export class AgyCliCompilerProvider extends CliCompilerProvider {
  constructor(options: CliCompilerOptions = {}) {
    const model = options.model ?? env.AGY_MODEL;
    super({
      ...options,
      providerName: 'agy',
      cliCommand: options.cliCommand ?? env.AGY_CLI_PATH,
      cliArgsBuilder:
        options.cliArgsBuilder ??
        ((promptFile: string) => [
          '--print',
          `Evaluate prompt file at "${promptFile}" and execute its instructions.`,
          ...(model ? ['--model', model] : []),
          '--sandbox',
          '--disable-slash-commands',
        ]),
    });
  }
}
