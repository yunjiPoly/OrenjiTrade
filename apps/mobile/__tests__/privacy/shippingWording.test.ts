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
 * Collectors don't meet: deals ship by mail (ADR 0018, the redesign's section 11). Nothing the app
 * shows says "meet", "meetup", "in person", "game store", "café" or "the locals". Identifiers
 * such as `meetupReliability` (the API column the phone keeps on edit) are not words and do not
 * match; comments are skipped. The legal texts are copies of the web's (`npm run sync:legal`):
 * "Trading safely" is checked by `legal.test.tsx`; the meetup clauses of the other texts are
 * left for the lawyer (the R1 section of IMPLEMENTATION_STATUS.md lists them).
 */
const MEETUP =
  /\bmeet(s|ing|ings|up|ups)?\b|\bmeet up\b|\bin[- ]person\b|\bgame ?stores?\b|\bcaf[eé]s?(?!\w)|\blocals\b|\blocal (meetups?|pickups?|trades?|stores?|shops?)\b/gi;

/** Firebase's own error code and its sentence: a password that does not meet the rules. */
const ALLOWED = [/password-does-not-meet-requirements/, /does not meet the requirements/];

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

describe('shipping-first wording (no meetup wording left in the app)', () => {
  it('the scanner knows meetup wording from identifiers and other words', () => {
    expect('Where do you like to meet?'.match(MEETUP)).toEqual(['meet']);
    expect('Meetup details always stay private'.match(MEETUP)).toEqual(['Meetup']);
    expect('Meet in a busy public place'.match(MEETUP)).toEqual(['Meet']);
    expect('Trade in person at the game store'.match(MEETUP)).toEqual(['in person', 'game store']);
    expect('See you Saturday at the café, after the Friday locals'.match(MEETUP)).toEqual([
      'café',
      'locals',
    ]);
    expect('Local meetups'.match(MEETUP)).toEqual(['Local meetups']);
    expect('body.meetupReliability = meetupScore'.match(MEETUP)).toBeNull();
    expect('Local test payment. The local Auth emulator'.match(MEETUP)).toBeNull();
    expect('Do you trade, sell or ship? Shipped with tracking.'.match(MEETUP)).toBeNull();
  });

  it('src/ and app/ say nothing about meeting', () => {
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
        if (isComment(line) || ALLOWED.some((allowed) => allowed.test(line))) {
          return;
        }
        for (const match of line.matchAll(MEETUP)) {
          findings.push(`${path.relative(ROOT, file)}:${index + 1}: ${match[0]}`);
        }
      });
    }
    expect(findings).toEqual([]);
  });
});
