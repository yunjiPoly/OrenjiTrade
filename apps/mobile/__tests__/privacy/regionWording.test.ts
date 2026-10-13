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

/**
 * Wording of a product that knows regions, not positions (ADR 0017, the web's wording): nothing
 * in the app says "near", "nearby", "close to you" or "around you". "Near Mint" is a card
 * condition and stays. The legal texts are copies of the web's and have their own guard
 * (`legalLanguage.test.ts`).
 */
const PROXIMITY =
  /\bnearby\b|\bnearest\b|\bnear (me|you|them|us|their|your|here)\b|\bclose to (me|you|them)\b|\baround (me|you)\b|\bin your area\b|\bkm away\b|\bmiles away\b/gi;

describe('region wording (no "near" or "nearby" left in the app)', () => {
  it('the scanner knows proximity wording from a card condition', () => {
    expect('Who has this near me'.match(PROXIMITY)).toEqual(['near me']);
    expect('Collectors nearby'.match(PROXIMITY)).toEqual(['nearby']);
    expect('2 km away'.match(PROXIMITY)).toEqual(['km away']);
    expect('Near Mint only'.match(PROXIMITY)).toBeNull();
    expect('Who has this in my region'.match(PROXIMITY)).toBeNull();
  });

  it('src/ and app/ use region wording only', () => {
    const findings: string[] = [];
    for (const file of [
      ...sourceFiles(path.join(ROOT, 'src')),
      ...sourceFiles(path.join(ROOT, 'app')),
    ]) {
      if (file.includes(`${path.sep}legal${path.sep}legalContent`)) {
        continue;
      }
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const match of line.matchAll(PROXIMITY)) {
          findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${match[0]}`);
        }
      });
    }
    expect(findings).toEqual([]);
  });

  it('the Map tab no longer says the map is coming', () => {
    const tab = fs.readFileSync(path.join(ROOT, 'app', '(tabs)', 'index.tsx'), 'utf8');
    expect(tab).not.toMatch(/coming to the app|placeholder/i);
  });
});
