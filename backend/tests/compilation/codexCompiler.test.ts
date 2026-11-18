import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, type SpawnOptions } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexCompilerProvider } from '../../src/providers/compilers/codexCompiler.provider.js';
import { fixturePlan } from '../helpers/extractionFixtures.js';
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});
describe('Codex transport', () => {
  it('uses default read-only arguments with a portable node subprocess', async () => {
    vi.stubEnv('JWT_SECRET', 'backend-session-secret');
    vi.stubEnv('DATABASE_URL', 'postgresql://secret@db/app');
    vi.stubEnv('OPENAI_API_KEY', 'test-cli-credential');
    vi.stubEnv('CODEX_SANDBOX', 'read-only');
    const root = await mkdtemp(path.join(tmpdir(), 'specter-codex-test-'));
    directories.push(root);
    const executable = path.join(root, 'fake-codex.cjs');
    const output = fixturePlan();
    await writeFile(
      executable,
      `const fs=require('node:fs');const args=process.argv.slice(2);
      const expected=['exec','--ephemeral','--skip-git-repo-check','--sandbox','read-only'];
      if(!expected.every((value,index)=>args[index]===value))process.exit(11);
      const index=args.indexOf('--output-last-message');if(index<0)process.exit(12);
      const prompt=fs.readFileSync('prompt.md','utf8');if(!prompt.includes('Find the page title'))process.exit(13);
      const schema=${JSON.stringify(JSON.stringify({ type: 'object', properties: { version: { type: 'number' } }, required: ['version'] }))};
      if(prompt.split(schema).length!==2)process.exit(14);
      if(!prompt.includes('untrusted data'))process.exit(15);
      if(process.env.JWT_SECRET || process.env.DATABASE_URL || process.env.ENCRYPTION_KEY || process.env.NODE_OPTIONS)process.exit(16);
      if(process.env.OPENAI_API_KEY !== 'test-cli-credential')process.exit(17);
      fs.writeFileSync(args[index+1],${JSON.stringify(JSON.stringify(output))});process.exit(0);`
    );
    const provider = new CodexCompilerProvider({
      tempBaseDir: path.join(root, 'work'),
      model: '',
      spawnFn: (_command: string, args: readonly string[], options: SpawnOptions) =>
        spawn(process.execPath, [executable, ...args], options),
    });
    const result = await provider.generate({
      task: 'configure',
      timeoutMs: 10000,
      jobId: 'local',
      evidence: '<h1>Example</h1>',
      instructions: 'Find the page title',
      outputSchema: {
        type: 'object',
        properties: { version: { type: 'number' } },
        required: ['version'],
      },
    });
    expect(result).toEqual(output);
    expect(await readdir(path.join(root, 'work'))).toEqual([]);
  });

  it('supports configured danger-full-access sandbox for container environments', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specter-codex-sandbox-'));
    directories.push(root);
    const executable = path.join(root, 'fake-codex-sandbox.cjs');
    const output = fixturePlan();
    await writeFile(
      executable,
      `const fs=require('node:fs');const args=process.argv.slice(2);
      const expected=['exec','--ephemeral','--skip-git-repo-check','--sandbox','danger-full-access'];
      if(!expected.every((value,index)=>args[index]===value))process.exit(11);
      const index=args.indexOf('--output-last-message');
      fs.writeFileSync(args[index+1], ${JSON.stringify(JSON.stringify(output))});process.exit(0);`
    );
    const provider = new CodexCompilerProvider({
      sandbox: 'danger-full-access',
      tempBaseDir: path.join(root, 'work'),
      spawnFn: (_command: string, args: readonly string[], options: SpawnOptions) =>
        spawn(process.execPath, [executable, ...args], options),
    });
    const result = await provider.generate({
      task: 'configure',
      timeoutMs: 10000,
      jobId: 'sandbox-test',
      evidence: '<h1>Example</h1>',
      instructions: 'Find the page title',
    });
    expect(result).toEqual(output);
  });

  it('parses JSON output wrapped in markdown code fences', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specter-codex-fenced-'));
    directories.push(root);
    const executable = path.join(root, 'fake-codex-fenced.cjs');
    const output = fixturePlan();
    const fencedOutput = '```json\n' + JSON.stringify(output, null, 2) + '\n```';
    await writeFile(
      executable,
      `const fs=require('node:fs');const args=process.argv.slice(2);
      const index=args.indexOf('--output-last-message');
      fs.writeFileSync(args[index+1], ${JSON.stringify(fencedOutput)});process.exit(0);`
    );
    const provider = new CodexCompilerProvider({
      tempBaseDir: path.join(root, 'work'),
      spawnFn: (_command: string, args: readonly string[], options: SpawnOptions) =>
        spawn(process.execPath, [executable, ...args], options),
    });
    const result = await provider.generate({
      task: 'configure',
      timeoutMs: 10000,
      jobId: 'fenced',
      evidence: '<h1>Example</h1>',
      instructions: 'Find the page title',
    });
    expect(result).toEqual(output);
  });
});
