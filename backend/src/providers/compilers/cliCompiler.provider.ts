import type { IModelProvider, ModelInput } from '../../extraction/model.js';
import { spawn, type SpawnOptions, type ChildProcess } from 'child_process';
import { watch, promises as fs, type FSWatcher } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { compilerEnvironment } from './cliEnvironment.js';
import {
  CompilerOutputTooLargeError,
  CompilerTimeoutError,
  CompilerValidationError,
} from '../../errors/domainErrors.js';
import { logger } from '../../utils/logger.js';
import { buildCliCompilerPrompt } from './compilerPrompt.js';
import { defaultCliErrorClassifier, type CliErrorClassifier } from './cliErrorClassifier.js';
import { getLangfuse } from '../langfuse.js';

export interface CliCompilerOptions {
  providerName?: string;
  cliCommand?: string;
  model?: string;
  outputMode?: 'file' | 'stdout';
  cliArgsBuilder?: (promptFile: string, outputFile: string) => string[];
  promptBuilder?: (domFilePath: string, outputFilePath: string, userPrompt: string) => string;
  stdinPromptBuilder?: (evidence: string, taskInstructions: string) => string;
  tempBaseDir?: string;
  timeoutMs?: number;
  errorClassifier?: CliErrorClassifier;
  spawnFn?:
    | ((command: string, args: readonly string[], options: SpawnOptions) => ChildProcess)
    | typeof spawn;
}

export class CliCompilerProvider implements IModelProvider {
  public readonly name: string;
  private readonly cliCommand: string;
  private readonly outputMode: 'file' | 'stdout';
  private readonly cliArgsBuilder: (promptFile: string, outputFile: string) => string[];
  private readonly tempBaseDir: string;
  private readonly timeoutMs: number;
  private readonly errorClassifier: CliErrorClassifier;
  private readonly spawnFn:
    | ((command: string, args: readonly string[], options: SpawnOptions) => ChildProcess)
    | typeof spawn;
  private readonly promptBuilder: NonNullable<CliCompilerOptions['promptBuilder']>;
  private readonly stdinPromptBuilder?: CliCompilerOptions['stdinPromptBuilder'];

  constructor(options: CliCompilerOptions = {}) {
    this.name = options.providerName ?? 'cli';
    this.cliCommand = options.cliCommand ?? 'cli';
    this.outputMode = options.outputMode ?? 'file';
    this.errorClassifier = options.errorClassifier ?? defaultCliErrorClassifier;
    this.cliArgsBuilder =
      options.cliArgsBuilder ??
      ((promptFile: string) => [
        '--print',
        `Evaluate prompt file at "${promptFile}" and execute its instructions.`,
        '--sandbox',
        '--disable-slash-commands',
      ]);
    this.tempBaseDir = options.tempBaseDir ?? env.COMPILER_TEMP_DIR;
    this.timeoutMs = options.timeoutMs ?? env.COMPILER_TIMEOUT_MS;
    this.spawnFn = options.spawnFn ?? spawn;
    this.promptBuilder = options.promptBuilder ?? buildCliCompilerPrompt;
    this.stdinPromptBuilder = options.stdinPromptBuilder;
  }

  async generate(input: ModelInput): Promise<unknown> {
    const { jobId, evidence: sanitizedHtml, instructions: userPrompt } = input;
    const taskInstructions = input.outputSchema
      ? `${userPrompt}\nReturn only a JSON object matching this schema: ${JSON.stringify(input.outputSchema)}`
      : userPrompt;
    const startTime = Date.now();
    const timeoutMs = Math.min(input.timeoutMs, this.timeoutMs);
    const safeJobDirName = jobId.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fs.mkdir(this.tempBaseDir, { recursive: true });
    const tempDir = await fs.mkdtemp(
      path.join(path.resolve(this.tempBaseDir), safeJobDirName + '-')
    );

    const promptFile = path.join(tempDir, 'prompt.md');
    const domFile = path.join(tempDir, 'dom.html');
    const outputFile = path.join(tempDir, 'extractor.json');

    const stdinPayload = this.stdinPromptBuilder
      ? this.stdinPromptBuilder(sanitizedHtml, taskInstructions)
      : undefined;

    if (stdinPayload === undefined) {
      await fs.writeFile(domFile, sanitizedHtml, 'utf-8');
      await fs.writeFile(
        promptFile,
        this.promptBuilder(domFile, outputFile, taskInstructions),
        'utf-8'
      );
    }

    const langfuse = getLangfuse();
    const trace = langfuse?.trace({
      name: 'specter:compiler:cli',
      sessionId: jobId ? `job:${jobId}` : undefined,
      userId: 'specter-cli-compiler',
      tags: ['specter', 'cli-compiler', this.name],
      input: { jobId, instructions: userPrompt },
      metadata: { cliCommand: this.cliCommand, provider: this.name },
    });
    const span = trace?.span({
      name: 'cli-subprocess',
      input: { jobId, timeoutMs },
      startTime: new Date(startTime),
    });

    try {
      const result = await new Promise<unknown>((resolve, reject) => {
      let settled = false;
      let watcherClosed = false;
      let fileWatcher: FSWatcher | null = null;

      const args = this.cliArgsBuilder(promptFile, outputFile);
      const spawnOpts: SpawnOptions = {
        cwd: tempDir,
        stdio: [stdinPayload !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: false,
        signal: input.signal,
        env: compilerEnvironment(this.name),
      };

      let stderrBuffer = '';
      let stdoutBuffer = '';
      let stdoutOverflow = false;
      const cliProcess = this.spawnFn(this.cliCommand, args, spawnOpts);
      if (stdinPayload !== undefined && cliProcess.stdin) {
        cliProcess.stdin.on('error', () => {
          // Ignore EPIPE when the subprocess exits before consuming stdin.
        });
        cliProcess.stdin.end(stdinPayload, 'utf-8');
      }
      if (this.outputMode === 'stdout') {
        cliProcess.stdout?.on('data', (chunk: Buffer | string) => {
          if (stdoutOverflow) return;
          stdoutBuffer += chunk.toString();
          if (stdoutBuffer.length > env.COMPILER_MAX_OUTPUT_CHARS) {
            stdoutOverflow = true;
          }
        });
      } else {
        // Drain streams so a verbose CLI cannot deadlock on a full pipe.
        cliProcess.stdout?.resume();
      }
      cliProcess.stderr?.on('data', (chunk: Buffer | string) => {
        if (stderrBuffer.length < 8192) {
          stderrBuffer += chunk.toString();
        }
      });
      const exited = new Promise<void>((resolve) => cliProcess.once('close', () => resolve()));

      const cleanup = async (): Promise<void> => {
        clearTimeout(timeoutTimer);
        if (fileWatcher && !watcherClosed) {
          try {
            fileWatcher.close();
          } catch {
            // ignore watcher close error
          }
          watcherClosed = true;
        }
        if (cliProcess.pid && cliProcess.exitCode === null && cliProcess.signalCode === null) {
          const wait = async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([
              exited,
              new Promise<void>((resolve) => {
                timer = setTimeout(resolve, 1000);
              }),
            ]);
            clearTimeout(timer);
          };
          await wait();
          if (cliProcess.exitCode === null && cliProcess.signalCode === null) {
            cliProcess.kill('SIGKILL');
            await wait();
          }
        }
        await fs
          .rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
          .catch((error) => {
            logger.warn('Compiler temporary directory cleanup failed', {
              jobId,
              errorCode: (error as NodeJS.ErrnoException).code,
            });
          });
      };

      const parseCliJson = (raw: string): unknown => {
        const trimmed = raw.trim();
        try {
          return JSON.parse(trimmed);
        } catch (err) {
          const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
          if (fenced?.[1]) {
            return JSON.parse(fenced[1].trim());
          }
          throw err;
        }
      };

      const tryReadOutputFile = async (): Promise<unknown | null> => {
        try {
          const stat = await fs.lstat(outputFile);
          if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new CompilerValidationError('Compiler output must be a regular file.');
          }
          if (stat.size > env.COMPILER_MAX_OUTPUT_CHARS * 4) throw new CompilerOutputTooLargeError();
          const content = await fs.readFile(outputFile, 'utf-8');
          if (content.length > env.COMPILER_MAX_OUTPUT_CHARS) {
            throw new CompilerOutputTooLargeError();
          }
          if (!content.trim()) return null;
          const parsed: unknown = parseCliJson(content);
          return parsed;
        } catch (err) {
          if (err instanceof CompilerValidationError) {
            throw err;
          }
          if (err instanceof SyntaxError || (err as NodeJS.ErrnoException).code === 'ENOENT')
            return null;
          throw new CompilerValidationError(
            err instanceof Error ? err.message : 'Invalid extraction plan.'
          );
        }
      };

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          cliProcess.kill('SIGKILL');
        } catch {
          // ignore kill error
        }
        void cleanup().finally(() => {
          const durationMs = Date.now() - startTime;
          logger.error('Compiler CLI timed out (dead man switch triggered)', {
            jobId,
            provider: this.name,
            durationMs,
            errorCode: 'COMPILER_TIMEOUT',
          });
          reject(
            new CompilerTimeoutError(
              `${this.name.toUpperCase()} compilation timed out after ${timeoutMs}ms`
            )
          );
        });
      }, timeoutMs);

      if (this.outputMode === 'file') {
        try {
          fileWatcher = watch(tempDir, async (_eventType, filename) => {
            if (settled) return;
            const changedFile = filename?.toString();
            if (changedFile === 'extractor.json' || !changedFile) {
              try {
                await new Promise((r) => setTimeout(r, 100));
                if (settled) return;
                const parsed = await tryReadOutputFile();
                if (parsed && !settled) {
                  settled = true;
                  try {
                    cliProcess.kill('SIGTERM');
                  } catch {
                    // ignore kill error
                  }
                  await cleanup();
                  logger.info('Compiler successfully generated extractor schema', {
                    jobId,
                    provider: this.name,
                    durationMs: Date.now() - startTime,
                  });
                  resolve(parsed);
                }
              } catch (err) {
                if (!settled && err instanceof CompilerValidationError) {
                  settled = true;
                  try {
                    cliProcess.kill('SIGTERM');
                  } catch {
                    // ignore
                  }
                  await cleanup();
                  reject(err);
                }
              }
            }
          });
        } catch (err) {
          if (!settled) {
            settled = true;
            void cleanup().finally(() => reject(err));
          }
        }
      }

      cliProcess.on('error', (err) => {
        if (settled) return;
        settled = true;
        void cleanup().finally(() => {
          reject(
            input.signal?.aborted
              ? new CompilerTimeoutError('CLI model task cancelled or timed out.', err)
              : new CompilerValidationError(
                  `Failed to spawn ${this.name} CLI subprocess: ${err.message}`,
                  err
                )
          );
        });
      });

      cliProcess.on('close', async (code) => {
        if (settled) return;

        if (this.outputMode === 'stdout') {
          if (stdoutOverflow) {
            settled = true;
            await cleanup();
            reject(new CompilerOutputTooLargeError());
            return;
          }
          if (code === 0 && stdoutBuffer.trim()) {
            try {
              const parsed = parseCliJson(stdoutBuffer);
              settled = true;
              await cleanup();
              resolve(parsed);
              return;
            } catch (err) {
              settled = true;
              await cleanup();
              reject(
                new CompilerValidationError(
                  err instanceof Error ? err.message : 'Invalid extraction plan.'
                )
              );
              return;
            }
          }
        } else {
          // Check if extractor.json was written right before process exit
          try {
            const parsed = await tryReadOutputFile();
            if (parsed) {
              settled = true;
              await cleanup();
              resolve(parsed);
              return;
            }
          } catch (err) {
            settled = true;
            await cleanup();
            reject(err);
            return;
          }
        }

        settled = true;
        await cleanup();
        const capturedStderr = stderrBuffer.trim();
        const classified = this.errorClassifier({
          providerName: this.name,
          exitCode: code,
          stderr: capturedStderr,
        });
        if (classified) {
          reject(classified);
          return;
        }
        reject(
          new CompilerValidationError(
            `${this.name.toUpperCase()} process exited with code ${code ?? 'unknown'} without producing extractor.json${
              capturedStderr ? `: ${capturedStderr.slice(0, 300)}` : ''
            }`
          )
        );
      });
    });
    span?.end({ output: result });
    trace?.update({ output: result });
    return result;
  } catch (err) {
    span?.end({ output: { error: String(err) }, level: 'ERROR' });
    trace?.update({ output: { error: String(err) } });
    throw err;
  }
}
}
