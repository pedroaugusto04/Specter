import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// Maintenance command: run from a consumer with TypeScript installed.
const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const directory = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(directory, 'vocabulary.js');
const program = ts.createProgram([input], {
  allowJs: true,
  declaration: true,
  emitDeclarationOnly: true,
  skipLibCheck: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
});
program.emit();
const names = [...fs.readFileSync(input, 'utf8').matchAll(/export const (\w+) =/g)].map(
  (match) => match[1]
);
fs.appendFileSync(
  path.join(directory, 'vocabulary.d.ts'),
  '\n' +
    names
      .map((name) => `export type ${name} = (typeof ${name})[keyof typeof ${name}];`)
      .join('\n') +
    '\n'
);
