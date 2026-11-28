import { env } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';
import { buildReadOnlyStdoutCompilerPrompt } from './compilerPrompt.js';

export type { CliCompilerOptions } from './cliCompiler.provider.js';

/** Runs AGY CLI in read-only plan mode with sandbox, isolated settings, and stdout JSON output. */
export class AgyCliCompilerProvider extends CliCompilerProvider {
  constructor(options: CliCompilerOptions = {}) {
    const model = options.model ?? env.AGY_MODEL;
    const outputMode = options.outputMode ?? (options.cliArgsBuilder ? 'file' : 'stdout');
    super({
      ...options,
      providerName: 'agy',
      outputMode,
      cliCommand: options.cliCommand ?? env.AGY_CLI_PATH,
      promptBuilder:
        options.promptBuilder ??
        (outputMode === 'stdout' ? buildReadOnlyStdoutCompilerPrompt : undefined),
      cliArgsBuilder:
        options.cliArgsBuilder ??
        ((promptFile: string) => [
          '--print',
          `Evaluate prompt file at "${promptFile}" and return only the JSON result.`,
          ...(model ? ['--mode', 'plan', '--model', model] : []),
          '--sandbox',
          '--disable-slash-commands',
          '--settings',
          '{}',
        ]),
    });
  }
}
