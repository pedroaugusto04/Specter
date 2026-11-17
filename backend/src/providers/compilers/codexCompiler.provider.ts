import { env } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';
import { buildCodexCliCompilerPrompt } from './compilerPrompt.js';

/** Runs Codex CLI locally with read-only access to an isolated compilation directory. */
export class CodexCompilerProvider extends CliCompilerProvider {
  constructor(options: CliCompilerOptions = {}) {
    const model = options.model ?? env.COMPILER_CODEX_MODEL;
    super({
      ...options,
      providerName: 'codex',
      cliCommand: options.cliCommand ?? env.CODEX_CLI_PATH,
      cliArgsBuilder:
        options.cliArgsBuilder ??
        ((promptFile, outputFile) => [
          'exec',
          '--ephemeral',
          '--skip-git-repo-check',
          ...(model ? ['-m', model] : []),
          '--sandbox',
          'read-only',
          '--output-last-message',
          outputFile,
          `Read and follow the instructions in ${JSON.stringify(promptFile)}. Return the final result only.`,
        ]),
      promptBuilder: buildCodexCliCompilerPrompt,
    });
  }
}
