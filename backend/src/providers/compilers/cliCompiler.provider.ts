import type { IModelProvider, ModelInput } from '../../extraction/model.js';
import { spawn, type SpawnOptions, type ChildProcess } from 'child_process';
import { watch, promises as fs, type FSWatcher } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { CompilerTimeoutError, CompilerValidationError } from '../../errors/domainErrors.js';
import { logger } from '../../utils/logger.js';
import { buildCliCompilerPrompt } from './compilerPrompt.js';

export interface CliCompilerOptions {
  providerName?: string;
  cliCommand?: string;
  cliArgsBuilder?: (promptFile: string, outputFile: string) => string[];
  promptBuilder?: (domFilePath: string, outputFilePath: string, userPrompt: string) => string;
  tempBaseDir?: string;
  timeoutMs?: number;
  spawnFn?: ((command: string, args: readonly string[], options: SpawnOptions) => ChildProcess) | typeof spawn;
}

export class CliCompilerProvider implements IModelProvider {
  public readonly name: string;
  private readonly cliCommand: string;
  private readonly cliArgsBuilder: (promptFile: string, outputFile: string) => string[];
  private readonly tempBaseDir: string;
  private readonly timeoutMs: number;
  private readonly spawnFn: ((command: string, args: readonly string[], options: SpawnOptions) => ChildProcess) | typeof spawn;
  private readonly promptBuilder: NonNullable<CliCompilerOptions['promptBuilder']>;

  constructor(options: CliCompilerOptions = {}) {
    this.name = options.providerName ?? 'cli';
    this.cliCommand = options.cliCommand ?? 'cli';
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
  }

  async generate(input: ModelInput): Promise<unknown> {
    const { jobId, evidence: sanitizedHtml, instructions: userPrompt } = input;
    const startTime = Date.now();
    const timeoutMs = Math.min(input.timeoutMs ?? this.timeoutMs, this.timeoutMs);
    const safeJobDirName = jobId.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fs.mkdir(this.tempBaseDir, { recursive: true });
    const tempDir = await fs.mkdtemp(
      path.join(path.resolve(this.tempBaseDir), safeJobDirName + '-')
    );

    const promptFile = path.join(tempDir, 'prompt.md');
    const domFile = path.join(tempDir, 'dom.html');
    const outputFile = path.join(tempDir, 'extractor.json');

    await fs.writeFile(domFile, sanitizedHtml, 'utf-8');
    await fs.writeFile(promptFile, this.promptBuilder(domFile, outputFile, userPrompt), 'utf-8');

    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      let watcherClosed = false;
      let fileWatcher: FSWatcher | null = null;

      const args = this.cliArgsBuilder(promptFile, outputFile);
      const spawnOpts: SpawnOptions = {
        cwd: tempDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      };

      const cliProcess = this.spawnFn(this.cliCommand, args, spawnOpts);
      // Drain streams so a verbose CLI cannot deadlock on a full pipe.
      cliProcess.stdout?.resume();
      cliProcess.stderr?.resume();
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

      const tryReadOutputFile = async (): Promise<unknown | null> => {
        try {
          const content = await fs.readFile(outputFile, 'utf-8');
          if (!content.trim()) return null;
          const parsed: unknown = JSON.parse(content);
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

      try {
        fileWatcher = watch(tempDir, async (_eventType, filename) => {
          if (settled) return;
          if (filename === 'extractor.json' || !filename) {
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

      cliProcess.on('error', (err) => {
        if (settled) return;
        settled = true;
        void cleanup().finally(() => {
          reject(
            new CompilerValidationError(
              `Failed to spawn ${this.name} CLI subprocess: ${err.message}`,
              err
            )
          );
        });
      });

      cliProcess.on('close', async (code) => {
        if (settled) return;

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

        settled = true;
        await cleanup();
        reject(
          new CompilerValidationError(
            `${this.name.toUpperCase()} process exited with code ${code ?? 'unknown'} without producing extractor.json`
          )
        );
      });
    });
  }
}
