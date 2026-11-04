import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexCompilerProvider } from '../src/providers/compilers/codexCompiler.provider.js';
import { fixturePlan } from './helpers/extractionFixtures.js';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});
describe('Codex transport', () => {
  it('uses default read-only arguments with a portable node subprocess', async () => {
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
      fs.writeFileSync(args[index+1],${JSON.stringify(JSON.stringify(output))});`
    );
    const provider = new CodexCompilerProvider({
      tempBaseDir: path.join(root, 'work'),
      spawnFn: (_command, args, options) =>
        spawn(process.execPath, [executable, ...args!], options!),
    });
    const result = await provider.generate({
      task: 'plan',
      timeoutMs: 10000,
      jobId: 'local',
      evidence: '<h1>Example</h1>',
      instructions: 'Find the page title',
    });
    expect(result).toEqual(output);
    expect(await readdir(path.join(root, 'work'))).toEqual([]);
  });
});
