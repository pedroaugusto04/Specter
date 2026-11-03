import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexCompilerProvider } from '../src/providers/compilers/codexCompiler.provider.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('Codex CLI compiler provider', () => {
  it('runs codex exec in read-only mode and captures its final extraction plan', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specter-codex-test-'));
    temporaryDirectories.push(root);
    const workDirectory = path.join(root, 'compiler-work');
    const executable = path.join(root, 'fake-codex');
    await writeFile(
      executable,
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const expected = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only'];
if (!expected.every((value, index) => args[index] === value)) process.exit(11);
const outputIndex = args.indexOf('--output-last-message');
if (outputIndex < 0 || !args[outputIndex + 2]?.endsWith('Return the final result only.')) process.exit(12);
const prompt = fs.readFileSync(path.join(process.cwd(), 'prompt.md'), 'utf8');
const evidence = fs.readFileSync(path.join(process.cwd(), 'dom.html'), 'utf8');
if (!prompt.includes('Find the page title') || !evidence.includes('<h1>Example</h1>')) process.exit(13);
fs.writeFileSync(args[outputIndex + 1], JSON.stringify({
  version: 2,
  mode: 'single',
  readySelector: 'main',
  scope: 'page',
  identityFields: [],
  triggerRules: [],
  triggerMatchMode: 'all',
  fields: { title: { type: 'string', required: true, sources: [{ kind: 'dom', selector: 'h1', attribute: 'text' }] } }
}));
`
    );
    await chmod(executable, 0o755);

    const provider = new CodexCompilerProvider({
      cliCommand: executable,
      tempBaseDir: workDirectory,
    });
    const plan = await provider.compile({
      jobId: 'codex-local-test',
      sanitizedHtml: '<main><h1>Example</h1></main>',
      userPrompt: 'Find the page title',
    });

    expect(provider.name).toBe('codex');
    expect(plan.fields.title.sources[0]).toMatchObject({ kind: 'dom', selector: 'h1' });
    await expect(
      readFile(path.join(workDirectory, 'codex-local-test', 'prompt.md'))
    ).rejects.toThrow();
  });
});
