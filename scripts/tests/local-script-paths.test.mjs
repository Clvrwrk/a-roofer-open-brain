import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const tools = [
  'scripts/build-inv-processed-weekly.mjs',
  'scripts/alex-no-price-triage.mjs',
  'scripts/invoice-audit-v2/link-vendor-invoice-pdfs.mjs',
  'scripts/maya-qa-orchestrate.mjs',
  'scripts/site-quality-sweep.mjs',
  'scripts/chaos-forensic-assign.mjs',
  'integrations/bridges/companycam/sync.mjs',
  'integrations/bridges/abc-supply/production-sync.mjs',
  'integrations/bridges/abc-supply/mirror-backfill.mjs',
  'integrations/bridges/abc-supply/backfill-invoice-pdfs.mjs',
  'integrations/bridges/abc-supply/fill-open-invoice-api-prices.mjs',
  'integrations/bridges/abc-supply/price-seed.mjs',
  'integrations/bridges/abc-supply/sandbox-smoke.mjs',
  'integrations/bridges/acculynx-documents/load.mjs',
];

test('operational tools resolve real filesystem paths through the renamed checkout alias', async t => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'pe-path-regression-')));
  const actualRoot = join(temporary, 'M1 Application SSD', 'Pro Exteriors US APP #1 % fixture');
  const alias = join(temporary, 'original-checkout');
  await mkdir(actualRoot, { recursive: true });
  await symlink(actualRoot, alias, 'dir');
  await writeFile(join(actualRoot, '.env'), 'SYNTHETIC_PATH_FIXTURE=true\n');
  try {
    for (const relative of tools) {
      await t.test(relative, async () => {
        const source = await readFile(join(repository, relative), 'utf8');
        // Run the actual path initializers, without importing operational code that
        // sends requests, stamps invoices, writes exports, or loads credentials.
        const initializers = [...source.matchAll(/^const (ROOT|HERE|REPO|RUN_DIR) = (.+);$/gm)];
        assert.ok(initializers.length, `No path initializer captured for ${relative}`);
        const probe = join(actualRoot, relative);
        await mkdir(dirname(probe), { recursive: true });
        await writeFile(probe, [
          'import { fileURLToPath } from "node:url";',
          'import { dirname, join, resolve } from "node:path";',
          'const process = { env: {} };',
          ...initializers.map(([line]) => line),
          `export default { ${initializers.map(([, name]) => name).join(', ')} };`,
        ].join('\n'));
        const values = (await import(pathToFileURL(join(alias, relative)).href)).default;
        for (const [name, value] of Object.entries(values)) {
          const expected = name === 'HERE' ? dirname(probe)
            : name === 'RUN_DIR' ? join(dirname(probe), '.price-seed-runs')
            : actualRoot;
          assert.equal(value, expected, `${relative}: ${name}`);
          if (name !== 'RUN_DIR') assert.ok(existsSync(value));
        }
        if (values.ROOT) assert.equal(await readFile(resolve(values.ROOT, '.env'), 'utf8'), 'SYNTHETIC_PATH_FIXTURE=true\n');
      });
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
