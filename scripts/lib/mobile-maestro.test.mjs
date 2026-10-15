// Unit tests of the native Maestro harness (node --test; npm run test:scripts): what each
// platform's Metro is started with and which API the app is pointed at. Nothing here starts
// Metro, a device or Maestro.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { expoStartArgs, freshenFlowMedia, metroEnv, targetFor } from './mobile-maestro.mjs';

describe('Metro of the native suite', () => {
  it('Android: `expo start --android` opens Expo Go on the emulator, as it always did', () => {
    assert.deepEqual(expoStartArgs('android'), ['start', '--port', '8082', '--android', '--clear']);
  });

  it('iOS: no --ios, so Expo CLI never opens the project on a simulator of its own choice', () => {
    assert.deepEqual(expoStartArgs('ios'), ['start', '--port', '8082', '--clear']);
  });

  it('Android: the app reaches the isolated API and the Auth emulator at 10.0.2.2', () => {
    const env = metroEnv({ PATH: '/usr/bin', CI: '' }, targetFor('android'));
    assert.equal(env.EXPO_PUBLIC_API_BASE_URL, 'http://10.0.2.2:8090');
    assert.equal(env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST, '10.0.2.2:9099');
    assert.equal(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, 'orenjitrade-local');
    assert.equal(env.CI, '1');
    assert.equal(env.PATH, '/usr/bin');
  });

  it('iOS: the simulator shares the network of the Mac, so the app uses localhost', () => {
    const env = metroEnv({}, targetFor('ios'));
    assert.equal(env.EXPO_PUBLIC_API_BASE_URL, 'http://localhost:8090');
    assert.equal(env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST, 'localhost:9099');
    assert.equal(env.EXPO_NO_TELEMETRY, '1');
  });

  it('never points the app at the developer API on :8080, whatever the environment says', () => {
    for (const platform of ['android', 'ios']) {
      const env = metroEnv({ EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8080' }, targetFor(platform));
      assert.doesNotMatch(env.EXPO_PUBLIC_API_BASE_URL, /:8080/);
      assert.match(env.EXPO_PUBLIC_API_BASE_URL, /:8090$/);
    }
  });

  it('the flows get the app id and the project URL of the platform', () => {
    assert.equal(targetFor('android').appId, 'host.exp.exponent');
    assert.equal(targetFor('android').appUrl, 'exp://10.0.2.2:8082');
    assert.equal(targetFor('ios').appId, 'host.exp.Exponent');
    assert.equal(targetFor('ios').appUrl, 'exp://127.0.0.1:8082');
  });
});

describe('the fictional pictures of the flows', () => {
  it('are dated now before a run, so the picker subflow takes the copy the flow just added', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-media-'));
    try {
      const photo = path.join(dir, 'fictional-card-photo.jpg');
      fs.writeFileSync(photo, 'jpeg');
      fs.chmodSync(photo, 0o640);
      fs.writeFileSync(path.join(dir, '.DS_Store'), '');
      const checkout = new Date('2026-10-14T16:58:00Z');
      fs.utimesSync(photo, checkout, checkout);
      const before = fs.statSync(photo);
      // The clock moves on between the checkout and the run.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
      const started = Date.now();

      assert.deepEqual(freshenFlowMedia(dir), [photo]);
      const after = fs.statSync(photo);
      assert.ok(after.mtimeMs >= started - 5, `modified ${after.mtime.toISOString()}`);
      // `simctl addmedia` dates the photo by the file's creation date: the picture is a new file
      // (a new modification date alone left the photo at the checkout's date).
      assert.notEqual(after.ino, before.ino);
      if (before.birthtimeMs > 0 && after.birthtimeMs > 0) {
        assert.ok(
          after.birthtimeMs >= started - 5,
          `created ${after.birthtime.toISOString()}, before the run started`
        );
      }
      assert.equal(fs.readFileSync(photo, 'utf8'), 'jpeg');
      assert.equal(after.mode & 0o777, 0o640);
      // Nothing else is left in the folder.
      assert.deepEqual(fs.readdirSync(dir).sort(), ['.DS_Store', 'fictional-card-photo.jpg']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing without a media folder', () => {
    assert.deepEqual(freshenFlowMedia(path.join(os.tmpdir(), 'no-such-maestro-media')), []);
  });
});
