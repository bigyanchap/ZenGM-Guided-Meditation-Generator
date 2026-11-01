/**
 * Tiny unit-test runner for ZenGM (no test framework dependency).
 * Usage: npm test            — runs every tests/*.test.ts
 *        node tests/run.mjs tests/music-blueprint.test.ts
 * Bundles each test file with esbuild (a Vite dependency) and provides a
 * minimal jest-style shim: describe / it / expect.
 */
import { build } from 'esbuild';
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const suites = [];
let current = null;
globalThis.describe = (name, fn) => {
  const prev = current;
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = prev;
};
globalThis.it = (name, fn) => current.tests.push({ name, fn });

function eq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}
const fmt = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
globalThis.expect = (actual) => ({
  toBe: (e) => { if (actual !== e) throw new Error(`expected ${fmt(actual)} toBe ${fmt(e)}`); },
  toEqual: (e) => { if (!eq(actual, e)) throw new Error(`expected ${fmt(actual)} toEqual ${fmt(e)}`); },
  toContain: (e) => {
    const ok = typeof actual === 'string' ? actual.includes(e) : Array.isArray(actual) && actual.includes(e);
    if (!ok) throw new Error(`expected ${fmt(actual)} toContain ${fmt(e)}`);
  },
  toBeGreaterThan: (e) => { if (!(actual > e)) throw new Error(`expected ${actual} > ${e}`); },
  toBeLessThan: (e) => { if (!(actual < e)) throw new Error(`expected ${actual} < ${e}`); },
  toBeNull: () => { if (actual !== null) throw new Error(`expected ${fmt(actual)} toBeNull`); },
});

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.test.ts')).map(f => `tests/${f}`);

const outDir = mkdtempSync(path.join(tmpdir(), 'zengm-tests-'));
let pass = 0, fail = 0;
for (const file of files) {
  const outfile = path.join(outDir, path.basename(file).replace(/\.ts$/, '.cjs'));
  await build({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  await import(pathToFileURL(outfile).href);
}
for (const s of suites) {
  console.log(s.name);
  for (const t of s.tests) {
    try {
      await t.fn();
      pass++;
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${t.name}\n    ${e.message}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
