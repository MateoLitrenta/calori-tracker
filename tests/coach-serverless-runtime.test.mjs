import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('compiled Coach function loads without TypeScript sources and serves both failing queries over HTTP', async t => {
  const artifact = await mkdtemp(path.join(tmpdir(), 'coach-serverless-'));
  t.after(() => rm(artifact, { recursive: true, force: true }));
  const entrypoint = path.join(root, 'api/ai/chat.ts');
  // Vercel resolves the nearest tsconfig to the entrypoint, then emits traced
  // TypeScript dependencies as JavaScript. Test the emitted files, not Node's
  // native TypeScript loader (which concealed the regression in source tests).
  const config = ts.findConfigFile(path.dirname(entrypoint), ts.sys.fileExists);
  assert.ok(config);
  await writeFile(path.join(artifact, 'tsconfig.json'), JSON.stringify({
    extends: config,
    compilerOptions: { target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext',
      types: ['node'], typeRoots: [path.join(root, 'node_modules/@types')],
      rootDir: root, outDir: artifact, noEmit: false, incremental: false, composite: false,
      declaration: false, noCheck: true },
    files: [entrypoint], include: [], exclude: [],
  }));
  await run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    '-p', path.join(artifact, 'tsconfig.json')]);
  await writeFile(path.join(artifact, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(artifact, 'probe.mjs'), await readFile(
    new URL('./fixtures/coach-serverless-probe.mjs', import.meta.url)));
  const { stdout } = await run(process.execPath, ['--no-experimental-strip-types',
    path.join(artifact, 'probe.mjs')], { timeout: 30_000 });
  assert.match(stdout, /Coach HTTP probe: 3 requests passed/);
  assert.match(stdout, /AI security HTTP probe: 401\/429\/503 passed without extra Gemini calls/);
  assert.match(stdout, /AI response validation HTTP probe: 200\/502\/200 passed without retry/);
});
