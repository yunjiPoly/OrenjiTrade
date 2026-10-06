import fs from 'node:fs';
import path from 'node:path';

import { zoneFitZoom } from '@/src/lib/approximateArea';

const ROOT = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** A number literal with 4 or more decimals (about 11 m or finer as a coordinate). */
const PRECISE_NUMBER = /(?<![\w.])-?\d{1,3}\.\d{4,}(?![\d_])/g;

describe('no precise coordinate in the app source (ADR 0004)', () => {
  it('keeps every number literal of src/ and app/ at 3 decimals at most', () => {
    const findings: string[] = [];
    for (const file of [
      ...sourceFiles(path.join(ROOT, 'src')),
      ...sourceFiles(path.join(ROOT, 'app')),
    ]) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const match of line.matchAll(PRECISE_NUMBER)) {
          findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${match[0]}`);
        }
      });
    }
    // The Phase 0 default region (45.5017, -73.5673) was removed with stage M3; the Web Mercator
    // latitude limit is computed.
    expect(findings).toEqual([]);
  });
});

describe('zoneFitZoom', () => {
  it('fits the whole 3 km zone in the profile map, at most at zoom 13', () => {
    expect(zoneFitZoom(45.5, 260)).toBe(13);
    expect(zoneFitZoom(43.65, 260)).toBe(13);
    expect(zoneFitZoom(51.05, 260)).toBe(12);
    expect(zoneFitZoom(60.17, 260)).toBe(12);
    expect(zoneFitZoom(0, 600)).toBe(13);
    expect(zoneFitZoom(45.5, 0)).toBe(13);
    expect(zoneFitZoom(89.9, 260)).toBeGreaterThanOrEqual(3);
  });
});
