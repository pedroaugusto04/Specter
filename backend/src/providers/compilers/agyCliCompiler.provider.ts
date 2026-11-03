import { spawn, type SpawnOptions } from 'child_process';
import { watch, promises as fs, type FSWatcher } from 'fs';
import path from 'path';
import { env } from '../../config/env.js';
import { CompilerTimeoutError, CompilerValidationError } from '../../errors/domainErrors.js';
import { logger } from '../../utils/logger.js';
import {
  buildCompilerPrompt,
  type CompilerInput,
  type ExtractorSchema,
  type ICompilerProvider,
} from './compiler.interface.js';

export interface CliCompilerOptions {
  cliCommand?: string;
  cliArgsBuilder?: (promptFile: string, outputFile: string) => string[];
  tempBaseDir?: string;
  timeoutMs?: number;
  spawnFn?: typeof spawn;
}

export class AgyCliCompilerProvider implements ICompilerProvider {
  public readonly name: string = 'agy';
  private readonly cliCommand: string;
  private readonly cliArgsBuilder: (promptFile: string, outputFile: string) => string[];
  private readonly tempBaseDir: string;
  private readonly timeoutMs: number;
  private readonly spawnFn: typeof spawn;

  constructor(options: CliCompilerOptions = {}) {
    this.cliCommand = options.cliCommand ?? env.AGY_CLI_PATH;
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
  }

  async compile(input: CompilerInput): Promise<ExtractorSchema> {
    const { jobId, sanitizedHtml, userPrompt } = input;
    const startTime = Date.now();
    const safeJobDirName = jobId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempDir = path.resolve(this.tempBaseDir, safeJobDirName);

    await fs.mkdir(tempDir, { recursive: true });

    const promptFile = path.join(tempDir, 'prompt.md');
    const domFile = path.join(tempDir, 'dom.html');
    const outputFile = path.join(tempDir, 'extractor.json');

    await fs.writeFile(domFile, sanitizedHtml, 'utf-8');
    await fs.writeFile(promptFile, buildCompilerPrompt(domFile, outputFile, userPrompt), 'utf-8');

    return new Promise<ExtractorSchema>((resolve, reject) => {
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
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      };

      const tryReadOutputFile = async (): Promise<ExtractorSchema | null> => {
        try {
          const content = await fs.readFile(outputFile, 'utf-8');
          if (!content.trim()) return null;
          const parsed = JSON.parse(content) as ExtractorSchema;
          if (!parsed || typeof parsed !== 'object' || !parsed.fields) {
            throw new CompilerValidationError(
              'Compiled extractor.json is missing required "fields" property.'
            );
          }
          return parsed;
        } catch (err) {
          if (err instanceof CompilerValidationError) {
            throw err;
          }
          return null;
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
              `${this.name.toUpperCase()} compilation timed out after ${this.timeoutMs}ms`
            )
          );
        });
      }, this.timeoutMs);

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
