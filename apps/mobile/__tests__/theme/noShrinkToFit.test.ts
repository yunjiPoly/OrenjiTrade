import fs from 'node:fs';
import path from 'node:path';

/**
 * Review fix 2 of the owner decisions of 2026-10-28 (R1-1): handles and toast titles were shrunk
 * to fit (`adjustsFontSizeToFit`) with a floor of `minimumFontScale` 0.6, which React Native's
 * renderer never applies. A handle was drawn a quarter of its size at the default text size. The
 * app no longer shrinks them: one line, capped, its end cut with "…".
 */

const ROOT = path.resolve(__dirname, '../..');
const RN = path.dirname(require.resolve('react-native/package.json'));

function read(relative: string): string {
  return fs.readFileSync(path.join(RN, relative), 'utf8');
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** The files of src/ and app/ whose code (not comments) names `prop`. */
function filesUsing(prop: string): string[] {
  const pattern = new RegExp(`\\b${prop}\\b`);
  return [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'app'))]
    .filter((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .some((line) => {
          const code = line.trim();
          return !/^(\/\/|\/\*|\*)/.test(code) && pattern.test(code);
        })
    )
    .map((file) => path.relative(ROOT, file))
    .sort();
}

describe('shrink to fit has no floor in React Native 0.86 (why the app does not use it)', () => {
  it('shrinks down to a minimumFontSize of 4 points on iOS and Android, never minimumFontScale', () => {
    // iOS (the new architecture's text layout): only `minimumFontSize`, 4 points when unset.
    const ios = read(
      'ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTTextLayoutManager.mm'
    );
    expect(ios).toMatch(
      /minimumFontSize = !isnan\(paragraphAttributes\.minimumFontSize\) \? paragraphAttributes\.minimumFontSize : 4\.0/
    );
    expect(ios).not.toMatch(/minimumFontScale/);
    // Android: the same `minimumFontSize`, 4 dp when unset.
    const android = read(
      'ReactAndroid/src/main/java/com/facebook/react/views/text/TextLayoutManager.kt'
    );
    expect(android).toMatch(/PA_KEY_MINIMUM_FONT_SIZE/);
    expect(android).toMatch(/4\.dpToPx\(\)/);
    expect(android).not.toMatch(/minimumFontScale|MINIMUM_FONT_SCALE/);
    // And the JavaScript `Text` cannot pass a `minimumFontSize`: only `minimumFontScale` reaches
    // the native side. When an upgrade changes any of this, a floor may be possible again.
    const native = read('Libraries/Text/TextNativeComponent.js');
    expect(native).toMatch(/minimumFontScale: true/);
    expect(native).not.toMatch(/minimumFontSize/);
  });
});

describe('no text of the app is shrunk to fit', () => {
  it('names minimumFontScale nowhere (a floor that is never applied)', () => {
    expect(filesUsing('minimumFontScale')).toEqual([]);
  });

  it('shrinks no handle, toast or label; the sign-in wordmark is the one known use', () => {
    // The wordmark "OrenjiTrade" (stage R12's walk, before this batch) keeps it: one short word
    // that fits at its cap, reported to the owner with this fix rather than changed here.
    expect(filesUsing('adjustsFontSizeToFit')).toEqual(['app/(auth)/sign-in.tsx']);
  });
});
