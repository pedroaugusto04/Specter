import { env, type CodexSandboxMode } from '../../config/env.js';
import { CliCompilerProvider, type CliCompilerOptions } from './cliCompiler.provider.js';
import { buildCodexStdinCompilerPrompt } from './compilerPrompt.js';

export interface CodexCompilerOptions extends CliCompilerOptions {
  sandbox?: CodexSandboxMode;
}

const CODEX_DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'apps',
  'browser_use',
  'computer_use',
] as const;

/** Runs Codex CLI locally in stdin-only mode with shell/tool features disabled. */
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
        ((_promptFile, outputFile) => [
          'exec',
          '--ephemeral',
          '--skip-git-repo-check',
          '--ignore-user-config',
          '--ignore-rules',
          ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
          ...(model ? ['-m', model] : []),
          '--sandbox',
          sandbox,
          '--output-last-message',
          outputFile,
          '-',
        ]),
      stdinPromptBuilder: options.stdinPromptBuilder ?? buildCodexStdinCompilerPrompt,
    });
  }
}
