// Unit tests of the Java runtime selection for the API jar (node --test; npm run test:scripts).
// The E2E harnesses and the purge run the jar on what findJava21() returns; these tests pin the
// rules with fake `java` binaries and a fake version probe, so no JDK is needed to run them.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  API_JAVA_MAJOR,
  findJava21,
  gradleJdkJavaBins,
  javaCandidates,
  javaChoiceWarnings,
  loadDotEnv,
  selectJava,
} from './util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orenji-util-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function touch(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return file;
}

const PATH_JAVA = { javaBin: 'java', source: '`java` on PATH', override: false };
const MAC_JAVA = { javaBin: '/Library/Java/temurin-27/bin/java', source: '/usr/libexec/java_home', override: false };
const GRADLE_21 = { javaBin: '/home/.gradle/jdks/temurin-21/bin/java', source: 'the JDKs Gradle provisioned (~/.gradle/jdks)', override: false };
const orenjiHome = (dir) => ({ javaBin: `${dir}/bin/java`, source: 'ORENJI_JAVA_HOME', override: true });
const javaHome = (dir) => ({ javaBin: `${dir}/bin/java`, source: 'JAVA_HOME', override: true });

/** A probe answering from a { javaBin: major } table (0 for anything else) that records its calls. */
function probeOf(majors) {
  const probe = (javaBin) => {
    probe.calls.push(javaBin);
    return majors[javaBin] ?? 0;
  };
  probe.calls = [];
  return probe;
}

describe('Java runtime of the API jar', () => {
  it('targets the Java release of CI and production', () => {
    assert.equal(API_JAVA_MAJOR, 21);
  });

  it('prefers an exact Java 21 over a newer default JDK (system JDK 27, Gradle-provisioned 21)', () => {
    const probe = probeOf({ java: 27, [MAC_JAVA.javaBin]: 27, [GRADLE_21.javaBin]: 21 });
    const choice = selectJava([PATH_JAVA, MAC_JAVA, GRADLE_21], probe);
    assert.equal(choice.javaBin, GRADLE_21.javaBin);
    assert.equal(choice.major, 21);
    assert.equal(choice.exact, true);
    assert.deepEqual(javaChoiceWarnings(choice), []);
  });

  it('takes Java 21 from PATH without looking further', () => {
    const probe = probeOf({ java: 21, [GRADLE_21.javaBin]: 21 });
    const choice = selectJava([PATH_JAVA, GRADLE_21], probe);
    assert.equal(choice.javaBin, 'java');
    assert.deepEqual(probe.calls, ['java']);
  });

  it('keeps the override variables first: a usable ORENJI_JAVA_HOME wins even when it is newer', () => {
    const override = orenjiHome('/opt/jdk-25');
    const probe = probeOf({ [override.javaBin]: 25, java: 21, [GRADLE_21.javaBin]: 21 });
    const choice = selectJava([override, PATH_JAVA, GRADLE_21], probe);
    assert.equal(choice.javaBin, override.javaBin);
    assert.equal(choice.exact, false);
    // Nothing after a usable override is probed.
    assert.deepEqual(probe.calls, [override.javaBin]);
    const [warning, ...rest] = javaChoiceWarnings(choice);
    assert.deepEqual(rest, []);
    assert.match(warning, /will run on Java 25 \(ORENJI_JAVA_HOME: \/opt\/jdk-25\/bin\/java\)/);
    assert.match(warning, /CI and production run Java 21/);
    assert.match(warning, /Point ORENJI_JAVA_HOME at a JDK 21/);
  });

  it('ORENJI_JAVA_HOME wins over JAVA_HOME, and JAVA_HOME over PATH and the Gradle JDKs', () => {
    const first = orenjiHome('/opt/jdk-21');
    const second = javaHome('/opt/jdk-27');
    const majors = { [first.javaBin]: 21, [second.javaBin]: 27, java: 21, [GRADLE_21.javaBin]: 21 };
    assert.equal(selectJava([first, second, PATH_JAVA, GRADLE_21], probeOf(majors)).source, 'ORENJI_JAVA_HOME');
    const choice = selectJava([second, PATH_JAVA, GRADLE_21], probeOf(majors));
    assert.equal(choice.source, 'JAVA_HOME');
    assert.equal(choice.major, 27);
    assert.match(javaChoiceWarnings(choice)[0], /Set ORENJI_JAVA_HOME to a JDK 21 .*wins over JAVA_HOME/);
  });

  it('ignores an override that is too old or does not run, and says so', () => {
    const old = orenjiHome('/opt/jdk-17');
    const missing = javaHome('/opt/nowhere');
    const probe = probeOf({ [old.javaBin]: 17, java: 27, [GRADLE_21.javaBin]: 21 });
    const choice = selectJava([old, missing, PATH_JAVA, GRADLE_21], probe);
    assert.equal(choice.javaBin, GRADLE_21.javaBin);
    assert.deepEqual(
      choice.ignored.map((candidate) => [candidate.source, candidate.major]),
      [
        ['ORENJI_JAVA_HOME', 17],
        ['JAVA_HOME', 0],
      ],
    );
    const warnings = javaChoiceWarnings(choice);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /ORENJI_JAVA_HOME is set, but \/opt\/jdk-17\/bin\/java is Java 17; ignoring it/);
    assert.match(warnings[1], /JAVA_HOME is set, but \/opt\/nowhere\/bin\/java is not a working Java; ignoring it/);
  });

  it('falls back to a newer Java with a clear warning when no Java 21 exists', () => {
    const probe = probeOf({ java: 27, [MAC_JAVA.javaBin]: 27 });
    const choice = selectJava([PATH_JAVA, MAC_JAVA], probe);
    assert.equal(choice.javaBin, 'java');
    assert.equal(choice.exact, false);
    const warnings = javaChoiceWarnings(choice);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /will run on Java 27 \(`java` on PATH: java\), but CI and production run Java 21/);
    assert.match(warnings[0], /No Java 21 was found: install a JDK 21 or set ORENJI_JAVA_HOME/);
  });

  it('finds nothing when every Java is older than 21 or missing', () => {
    assert.equal(selectJava([javaHome('/opt/jdk-17'), PATH_JAVA], probeOf({ '/opt/jdk-17/bin/java': 17, java: 11 })), null);
    assert.equal(selectJava([], probeOf({})), null);
  });

  it('probes each binary once', () => {
    const probe = probeOf({ java: 27, [GRADLE_21.javaBin]: 22 });
    assert.equal(selectJava([PATH_JAVA, GRADLE_21], probe).javaBin, 'java');
    assert.deepEqual(probe.calls, ['java', GRADLE_21.javaBin]);
  });
});

describe('where the Java runtime is looked for', () => {
  it('orders the candidates: ORENJI_JAVA_HOME, JAVA_HOME, PATH, macOS java_home, Gradle JDKs', () => {
    const home = path.join(tmp, 'mac-home');
    const gradleJava = touch(
      path.join(home, '.gradle', 'jdks', 'eclipse_adoptium-21-aarch64-os_x.2', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'),
    );
    const candidates = javaCandidates(
      { ORENJI_JAVA_HOME: '/opt/orenji-jdk', JAVA_HOME: '/opt/shell-jdk' },
      { platform: 'darwin', home, javaHomeOfMac: () => '/Library/Java/JavaVirtualMachines/temurin-27.jdk/Contents/Home' },
    );
    assert.deepEqual(
      candidates.map((candidate) => [candidate.javaBin, candidate.override]),
      [
        [path.join('/opt/orenji-jdk', 'bin', 'java'), true],
        [path.join('/opt/shell-jdk', 'bin', 'java'), true],
        ['java', false],
        [path.join('/Library/Java/JavaVirtualMachines/temurin-27.jdk/Contents/Home', 'bin', 'java'), false],
        [gradleJava, false],
      ],
    );
    assert.deepEqual(
      candidates.map((candidate) => candidate.source).slice(0, 2),
      ['ORENJI_JAVA_HOME', 'JAVA_HOME'],
    );
  });

  it('asks /usr/libexec/java_home only on macOS, and skips unset variables', () => {
    const home = path.join(tmp, 'empty-home');
    const never = () => assert.fail('java_home is macOS only');
    assert.deepEqual(javaCandidates({}, { platform: 'linux', home, javaHomeOfMac: never }), [
      { javaBin: 'java', source: '`java` on PATH', override: false },
    ]);
    assert.deepEqual(
      javaCandidates({ JAVA_HOME: '' }, { platform: 'darwin', home, javaHomeOfMac: () => null }).map((candidate) => candidate.javaBin),
      ['java'],
    );
    const windows = javaCandidates({ JAVA_HOME: 'C:\\jdk-21' }, { platform: 'win32', home, javaHomeOfMac: never });
    assert.ok(windows[0].javaBin.endsWith('java.exe'));
  });

  it('follows GRADLE_USER_HOME', () => {
    const gradleHome = path.join(tmp, 'custom-gradle-home');
    const bin = touch(path.join(gradleHome, 'jdks', 'temurin-21', 'bin', 'java'));
    const candidates = javaCandidates({ GRADLE_USER_HOME: gradleHome }, { platform: 'linux', home: path.join(tmp, 'unused') });
    assert.deepEqual(
      candidates.map((candidate) => candidate.javaBin),
      ['java', bin],
    );
  });
});

describe('findJava21 reads the variables from the shell and from the repository .env', () => {
  // No java_home call and no real ~/.gradle/jdks: only the variables and `java` on PATH count.
  const lookup = { platform: 'linux', home: path.join(tmp, 'no-such-home') };
  const bin = (home) => path.join(home, 'bin', 'java');

  function dotEnvFile(name, text) {
    const file = path.join(tmp, name, '.env');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  }

  function recorder() {
    const lines = [];
    return { lines, warn: (line) => lines.push(line), info: (line) => lines.push(line) };
  }

  it('uses ORENJI_JAVA_HOME from .env although the shell exports a newer JAVA_HOME', () => {
    // .env.example ships the entry empty; the developer fills it in.
    const dotEnv = loadDotEnv(dotEnvFile('env-21', '# --- Local scripts ---\nORENJI_JAVA_HOME=/opt/env-jdk-21\nJAVA_HOME=\n'));
    assert.deepEqual(dotEnv, { ORENJI_JAVA_HOME: '/opt/env-jdk-21' });
    const report = recorder();
    const probe = probeOf({ [bin('/opt/env-jdk-21')]: 21, [bin('/opt/shell-jdk-27')]: 27, java: 27 });
    const java = findJava21({ shellEnv: { JAVA_HOME: '/opt/shell-jdk-27' }, dotEnv, probe, lookup, report });
    assert.equal(java, bin('/opt/env-jdk-21'));
    assert.deepEqual(report.lines, []);
  });

  it('lets an exported variable win over the .env one, and an empty exported one switch it off', () => {
    const dotEnv = loadDotEnv(dotEnvFile('env-25', 'ORENJI_JAVA_HOME="/opt/env-jdk-25"\n'));
    const probe = () => probeOf({ [bin('/opt/env-jdk-25')]: 25, [bin('/opt/shell-jdk-21')]: 21, java: 21 });
    const exported = { ORENJI_JAVA_HOME: '/opt/shell-jdk-21' };
    assert.equal(findJava21({ shellEnv: exported, dotEnv, probe: probe(), lookup, report: recorder() }), bin('/opt/shell-jdk-21'));
    assert.equal(findJava21({ shellEnv: { ORENJI_JAVA_HOME: '' }, dotEnv, probe: probe(), lookup, report: recorder() }), 'java');
    // Without the exported variable the .env value is back, and the warning names its origin.
    const report = recorder();
    assert.equal(findJava21({ shellEnv: {}, dotEnv, probe: probe(), lookup, report }), bin('/opt/env-jdk-25'));
    assert.equal(report.lines.length, 1);
    assert.match(report.lines[0], /will run on Java 25 \(ORENJI_JAVA_HOME in \.env: /);
    assert.match(report.lines[0], /Point ORENJI_JAVA_HOME at a JDK 21/);
  });

  it('says that an unusable value comes from .env (a path copied from another machine)', () => {
    const dotEnv = loadDotEnv(dotEnvFile('env-windows', 'ORENJI_JAVA_HOME=C:\\jdks\\temurin-21\n'));
    const report = recorder();
    assert.equal(findJava21({ shellEnv: {}, dotEnv, probe: probeOf({ java: 21 }), lookup, report }), 'java');
    assert.equal(report.lines.length, 1);
    assert.match(report.lines[0], /^ORENJI_JAVA_HOME in \.env is set, but .* is not a working Java; ignoring it/);
  });

  it('reads GRADLE_USER_HOME from .env too, and finds nothing without any Java 21+', () => {
    const gradleHome = path.join(tmp, 'env-gradle-home');
    const provisioned = touch(path.join(gradleHome, 'jdks', 'temurin-21', 'bin', 'java'));
    const dotEnv = loadDotEnv(dotEnvFile('env-gradle', `GRADLE_USER_HOME=${gradleHome}\n`));
    const probe = probeOf({ java: 17, [provisioned]: 21 });
    assert.equal(findJava21({ shellEnv: {}, dotEnv, probe, lookup, report: recorder() }), provisioned);
    assert.equal(findJava21({ shellEnv: {}, dotEnv: {}, probe: probeOf({ java: 17 }), lookup, report: recorder() }), null);
  });

  it('reads no .env when the file does not exist', () => {
    assert.deepEqual(loadDotEnv(path.join(tmp, 'no-such-dir', '.env')), {});
  });
});

describe('JDKs provisioned by Gradle', () => {
  it('finds the nested macOS bundle, the nested Linux layout and a flat layout', () => {
    const jdks = path.join(tmp, 'jdks');
    const mac = touch(path.join(jdks, 'eclipse_adoptium-21-aarch64-os_x.2', 'jdk-21.0.12.1+1', 'Contents', 'Home', 'bin', 'java'));
    const linux = touch(path.join(jdks, 'eclipse_adoptium-21-amd64-linux.2', 'jdk-21.0.12.1+1', 'bin', 'java'));
    const flat = touch(path.join(jdks, 'flat-21', 'bin', 'java'));
    // What Gradle leaves next to the JDKs: the archive, its lock, the marker files.
    touch(path.join(jdks, 'OpenJDK21U-jdk_aarch64_mac_hotspot_21.tar.gz'));
    touch(path.join(jdks, 'eclipse_adoptium-21-aarch64-os_x.2.reserved.lock'));
    touch(path.join(jdks, 'eclipse_adoptium-21-aarch64-os_x.2', 'provisioned.ok'));
    fs.mkdirSync(path.join(jdks, 'broken-download', 'jdk-21'), { recursive: true });

    assert.deepEqual(gradleJdkJavaBins(jdks, 'java').sort(), [mac, linux, flat].sort());
  });

  it('lists the newest directory name first and copes with a missing directory', () => {
    const jdks = path.join(tmp, 'ordered-jdks');
    const older = touch(path.join(jdks, 'temurin-21', 'bin', 'java'));
    const newer = touch(path.join(jdks, 'temurin-25', 'bin', 'java'));
    assert.deepEqual(gradleJdkJavaBins(jdks, 'java'), [newer, older]);
    assert.deepEqual(gradleJdkJavaBins(path.join(tmp, 'no-such-dir'), 'java'), []);
  });

  it('looks for java.exe on Windows', () => {
    const jdks = path.join(tmp, 'windows-jdks');
    const exe = touch(path.join(jdks, 'eclipse_adoptium-21-amd64-windows.2', 'jdk-21.0.12.1+1', 'bin', 'java.exe'));
    assert.deepEqual(gradleJdkJavaBins(jdks, 'java.exe'), [exe]);
    assert.deepEqual(gradleJdkJavaBins(jdks, 'java'), []);
  });
});
