import { env } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';
import { buildCodexCliCompilerPrompt } from './compilerPrompt.js';

export interface CodexCompilerOptions extends CliCompilerOptions {
  model?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
}

/** Runs Codex CLI locally with read-only access to an isolated compilation directory. */
export class CodexCompilerProvider extends CliCompilerProvider {
  constructor(options: CodexCompilerOptions = {}) {
    const model = options.model ?? env.COMPILER_CODEX_MODEL;
    const sandbox = options.sandbox ?? env.CODEX_SANDBOX;
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
          sandbox,
          '--output-last-message',
          outputFile,
          `Read and follow the instructions in ${JSON.stringify(promptFile)}. Return the final result only.`,
        ]),
      promptBuilder: buildCodexCliCompilerPrompt,
    });
  }
}
