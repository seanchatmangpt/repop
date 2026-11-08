#!/usr/bin/env node
// No-React gate: @repop/client must never import react.
// Fail-loud guard first (rg-absence must not fake-pass), then fs-based scan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

const offenders = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p);
    } else if (['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs'].includes(extname(p))) {
      const text = readFileSync(p, 'utf8');
      if (/from\s+['"]react['"]|require\(\s*['"]react['"]\s*\)|import\s*\(\s*['"]react['"]\s*\)/.test(text)) {
        offenders.push(p);
      }
    }
  }
}
walk(ROOT);

if (offenders.length > 0) {
  console.error('NO-REACT GATE FAIL — react imports found:');
  for (const p of offenders) console.error('  ' + p);
  process.exit(1);
}
console.log('no-react gate: 0 react imports under src/ — PASS');
