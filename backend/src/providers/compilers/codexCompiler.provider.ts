import { env } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';
import { buildCodexCliCompilerPrompt } from './compilerPrompt.js';

export interface CodexCompilerOptions extends CliCompilerOptions {
  sandbox?: string;
}

/** Runs Codex CLI locally with configured sandbox access to an isolated compilation directory. */
export class CodexCompilerProvider extends CliCompilerProvider {
  constructor(options: CodexCompilerOptions = {}) {
    const model = options.model ?? env.COMPILER_CODEX_MODEL;
    const sandbox = options.sandbox ?? env.COMPILER_CODEX_SANDBOX;
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
          ...(sandbox === 'dangerously-bypass-approvals-and-sandbox'
            ? ['--dangerously-bypass-approvals-and-sandbox']
            : ['--sandbox', sandbox]),
          '--output-last-message',
          outputFile,
          `Read and follow the instructions in ${JSON.stringify(promptFile)}. Return the final result only.`,
        ]),
      promptBuilder: buildCodexCliCompilerPrompt,
    });
  }
}
