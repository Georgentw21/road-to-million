import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('every called private App method has an implementation', () => {
  const calls = new Set(
    [...appSource.matchAll(/this\.(_[A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1]),
  );
  const classMethods = new Set(
    [...appSource.matchAll(/^[ \t]{2}(?:async\s+)?(_[A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/gm)]
      .map((match) => match[1]),
  );
  const instanceBindings = new Set(
    [...appSource.matchAll(/this\.(_[A-Za-z0-9_]+)\s*=/g)].map((match) => match[1]),
  );

  const missing = [...calls]
    .filter((name) => !classMethods.has(name) && !instanceBindings.has(name))
    .sort();

  assert.deepEqual(missing, []);
});
