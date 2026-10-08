import fs from 'node:fs';
import path from 'node:path';

/**
 * The npm workspace also holds the Angular app, whose toolchain brings Babel 8. The Babel plugin
 * of react-native-worklets (added by babel-preset-expo for the native bundles) requires
 * `@babel/generator` and `@babel/traverse` without declaring them, so it uses whatever the
 * workspace root hoists; with Babel 8 there, every Android/iOS bundle fails to transform
 * (`[Worklets] Babel plugin exception`). The root package.json pins Babel 7 copies of both so
 * they are hoisted; this test fails if that ever regresses.
 */
function majorVersionFrom(fromFile: string, pkg: string): number {
  const entry = require.resolve(pkg, { paths: [path.dirname(fromFile)] });
  let dir = path.dirname(entry);
  while (!fs.existsSync(path.join(dir, 'package.json')) || !dir.endsWith(pkg.split('/')[1]!)) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`package.json of ${pkg} not found from ${entry}`);
    }
    dir = parent;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
    version: string;
  };
  return Number(manifest.version.split('.')[0]);
}

describe('native Babel toolchain', () => {
  const workletsPlugin = require.resolve('react-native-worklets/plugin');

  it.each(['@babel/generator', '@babel/traverse', '@babel/core'])(
    'the worklets Babel plugin resolves %s 7.x (not the web toolchain Babel 8)',
    (pkg) => {
      expect(majorVersionFrom(workletsPlugin, pkg)).toBe(7);
    }
  );
});
