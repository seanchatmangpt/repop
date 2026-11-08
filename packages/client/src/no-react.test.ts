// No-React + zero-JSON structural gates, executed as a vitest court.
// The standalone no-react gate script is the CI surface; this court makes the
// same law fail the normal vitest run.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname!; // vitest-injected; realm-safe (new URL(import.meta.url) is http-based under the jsdom env — C15 unblock, see c15 receipt)

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(p))) out.push(p);
  }
  return out;
}

describe('no-react + zero-JSON gates', () => {
  it('no file under src imports react', () => {
    const offender = walk(SRC).filter((f) =>
      /from\s+['"]react['"]|require\(\s*['"]react['"]\s*\)|import\s*\(\s*['"]react['"]\s*\)/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(offender).toEqual([]);
  });

  it('no file under src uses JSON serialization (zero-JSON law)', () => {
    // Pattern built at runtime so this court does not match its own source.
    const zeroJson = new RegExp('JSON' + String.fromCharCode(46) + '(parse|stringify)');
    const offender = walk(SRC).filter((f) => zeroJson.test(readFileSync(f, 'utf8')));
    expect(offender).toEqual([]);
  });
});
