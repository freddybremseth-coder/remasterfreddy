// Vite's normal build excludes /api serverless handlers. Compile each
// handler explicitly so malformed functions cannot deploy unnoticed again.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transform } from 'esbuild';

const files = (await readdir('api')).filter(name => name.endsWith('.ts'));
if (!files.length) throw new Error('No serverless API files found to validate.');
for (const file of files) {
  await transform(await readFile(join('api', file), 'utf8'), {
    loader: 'ts', target: 'es2020', sourcefile: file,
  });
}
console.log(`Validated TypeScript syntax in ${files.length} serverless API modules.`);
