import fs from 'node:fs';
import path from 'node:path';

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

describe('no precise coordinate in the app source (ADR 0004, ADR 0017)', () => {
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

/**
 * Coordinate, radius and distance identifiers, and the device-location and map-provider modules:
 * collectors declare a state or province (ADR 0017), so none of them has a use in the app.
 */
const GEO_IDENTIFIER =
  /\b(lat|lng|latitude|longitude|publicPoint|homePoint|radiusKm|distanceBucket|tradingArea|getCurrentPositionAsync)\b|from 'expo-location'|from 'react-native-maps'/g;

describe('no coordinate, distance or GPS code in the app source (ADR 0017)', () => {
  it('src/ and app/ name no coordinate, radius or distance and import no location module', () => {
    const findings: string[] = [];
    for (const file of [
      ...sourceFiles(path.join(ROOT, 'src')),
      ...sourceFiles(path.join(ROOT, 'app')),
    ]) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const match of line.matchAll(GEO_IDENTIFIER)) {
          findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${match[0]}`);
        }
      });
    }
    expect(findings).toEqual([]);
  });
});
