// Reads one step of a GitHub Actions workflow of this repository, enough for the guard tests to
// compare the environment CI gives a program with the one a local harness gives it
// (web-e2e-ci-parity.test.mjs). No YAML dependency (the root package has none): the workflows are
// written in plain block style, and this reads only what such a step holds, its `env:` mapping
// (plain, single- and double-quoted scalars) and its `run:` block. Anything else in the parts it
// reads (flow collections, anchors, tags, multi-line scalars) throws, so a test never compares a
// misread value. Pure: text in, values out.

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:[ \t]+(.*))?$/;

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isBlankOrComment(line) {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/** `key: value` of a line (indentation and a leading "- " already removed), null when it is none. */
function keyOf(content) {
  const match = KEY_LINE.exec(content.trimEnd());
  return match ? { key: match[1], value: match[2] ?? '' } : null;
}

/** Index after the mapping that starts below line `start` (a key at indent `indent`). */
function mappingEnd(lines, start, indent) {
  let end = start + 1;
  while (end < lines.length && (isBlankOrComment(lines[end]) || indentOf(lines[end]) > indent)) {
    end += 1;
  }
  return end;
}

/** Index after the block scalar below line `start` (a key at indent `indent`). */
function scalarEnd(lines, start, indent) {
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > indent)) {
    end += 1;
  }
  return end;
}

/** The keys of the mapping in lines [from, to): `{ key, value, line, indent }`, one per key. */
function childKeys(lines, from, to, where) {
  const children = [];
  let childIndent;
  for (let index = from; index < to; index += 1) {
    const line = lines[index];
    if (isBlankOrComment(line)) {
      continue;
    }
    const indent = indentOf(line);
    childIndent ??= indent;
    if (indent > childIndent) {
      continue; // inside a child's own block
    }
    if (indent < childIndent) {
      throw new Error(`${where}: line ${index + 1} is indented less than the keys before it.`);
    }
    const content = line.trim();
    const entry = keyOf(content.startsWith('- ') ? content.slice(2) : content);
    if (entry) {
      children.push({ ...entry, line: index, indent, item: content.startsWith('- ') });
    }
  }
  return children;
}

/**
 * A scalar of an `env:` entry as GitHub Actions turns it into an environment variable: the text
 * of a plain scalar, the content of a quoted one, null for an empty value (YAML null: write "" for
 * an empty string). Throws on anything else.
 */
export function scalarOf(raw, where) {
  const text = String(raw ?? '').trim();
  if (text === '' || text.startsWith('#')) {
    return null;
  }
  const doubled = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(text);
  if (doubled) {
    try {
      return JSON.parse(`"${doubled[1]}"`);
    } catch {
      throw new Error(`${where}: unsupported escape in ${text}.`);
    }
  }
  const single = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(text);
  if (single) {
    return single[1].replace(/''/g, "'");
  }
  if (/^["'[{&*!|>%@`]/.test(text)) {
    throw new Error(`${where}: unsupported value ${text} (plain, '...' or "..." scalars only).`);
  }
  return text.replace(/[ \t]+#.*$/, '').trim();
}

/**
 * Step `stepName` of job `jobId` in the workflow `text`: its `env:` entries (name to value, see
 * scalarOf) and its `run:` script (dedented). Throws when the job or the step is not there.
 */
export function workflowStep(text, jobId, stepName) {
  const lines = String(text).split(/\r?\n/);
  const top = childKeys(lines, 0, lines.length, 'workflow');
  const jobs = top.find((entry) => entry.key === 'jobs' && entry.indent === 0);
  if (!jobs) {
    throw new Error('The workflow has no jobs.');
  }
  const job = childKeys(lines, jobs.line + 1, mappingEnd(lines, jobs.line, 0), 'jobs').find(
    (entry) => entry.key === jobId,
  );
  if (!job) {
    throw new Error(`The workflow has no job "${jobId}".`);
  }
  const jobEnd = mappingEnd(lines, job.line, job.indent);
  const steps = childKeys(lines, job.line + 1, jobEnd, `job ${jobId}`).find((entry) => entry.key === 'steps');
  if (!steps) {
    throw new Error(`Job "${jobId}" has no steps.`);
  }
  const stepsEnd = mappingEnd(lines, steps.line, steps.indent);
  const items = [];
  for (let index = steps.line + 1; index < stepsEnd; index += 1) {
    const content = lines[index].trim();
    if (content === '-' || content.startsWith('- ')) {
      if (items.length > 0 && indentOf(lines[index]) !== items[0].indent) {
        continue; // a list inside a step
      }
      items.push({ line: index, indent: indentOf(lines[index]) });
    }
  }
  for (const [position, item] of items.entries()) {
    const itemEnd = position + 1 < items.length ? items[position + 1].line : stepsEnd;
    // `- name: ...`: the first key shares the dash's line, the others sit two columns further in.
    const first = keyOf(lines[item.line].trim().replace(/^-\s*/, ''));
    const keys = [
      ...(first ? [{ ...first, line: item.line, indent: item.indent + 2, item: false }] : []),
      ...childKeys(lines, item.line + 1, itemEnd, `job ${jobId}, step at line ${item.line + 1}`),
    ];
    const name = keys.find((entry) => entry.key === 'name');
    if (!name || scalarOf(name.value, `line ${name.line + 1}`) !== stepName) {
      continue;
    }
    const where = `job ${jobId}, step "${stepName}"`;
    const env = {};
    const envKey = keys.find((entry) => entry.key === 'env' && !entry.item);
    if (envKey) {
      if (envKey.value.trim() !== '' && !envKey.value.trim().startsWith('#')) {
        throw new Error(`${where}: env must be a block mapping.`);
      }
      const end = mappingEnd(lines, envKey.line, envKey.indent);
      for (const entry of childKeys(lines, envKey.line + 1, end, `${where}, env`)) {
        if (entry.item) {
          throw new Error(`${where}: env must be a mapping, not a list.`);
        }
        if (Object.hasOwn(env, entry.key)) {
          throw new Error(`${where}: env sets ${entry.key} twice.`);
        }
        env[entry.key] = scalarOf(entry.value, `${where}, env ${entry.key} (line ${entry.line + 1})`);
      }
      for (let index = envKey.line + 1; index < end; index += 1) {
        if (!isBlankOrComment(lines[index]) && !keyOf(lines[index].trim())) {
          throw new Error(`${where}: env line ${index + 1} is not a "NAME: value" entry.`);
        }
      }
    }
    let run = null;
    const runKey = keys.find((entry) => entry.key === 'run' && !entry.item);
    if (runKey) {
      const header = runKey.value.trim();
      if (header === '|' || header === '|-') {
        const block = lines.slice(runKey.line + 1, scalarEnd(lines, runKey.line, runKey.indent));
        const indent = Math.min(...block.filter((line) => line.trim() !== '').map(indentOf));
        run = block.map((line) => line.slice(indent)).join('\n').replace(/\n+$/, '');
      } else if (header !== '' && !/^[>|]/.test(header)) {
        run = scalarOf(header, `${where}, run`);
      } else {
        throw new Error(`${where}: run must be a plain line or a literal block (|).`);
      }
    }
    return { env, run };
  }
  throw new Error(`Job "${jobId}" has no step named "${stepName}".`);
}

/**
 * The variables a shell script exports with `export NAME=value` lines (one per line, the value
 * as written: quotes removed, `$VARIABLES` left as they are).
 */
export function exportsOf(script) {
  const exported = {};
  for (const line of String(script ?? '').split('\n')) {
    const match = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const value = match[2].trim();
    const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value);
    exported[match[1]] = quoted ? quoted[1] : value.split(/\s+/)[0];
  }
  return exported;
}

/**
 * Why the environment CI gives a program (`ci`) is not the one the local harness gives it
 * (`harness`): every harness variable must be in CI with the same value, CI may set nothing the
 * harness does not, and a variable of `differ` (name to a function giving CI's expected value from
 * the harness's) must still be in CI with exactly that value. Empty when they match.
 */
export function envParityProblems(harness, ci, differ = {}) {
  const problems = [];
  for (const [name, value] of Object.entries(harness)) {
    if (!Object.hasOwn(ci, name)) {
      problems.push(`${name} is missing from CI (the local harness sets ${JSON.stringify(value)}).`);
      continue;
    }
    const expected = Object.hasOwn(differ, name) ? differ[name](value) : value;
    if (ci[name] !== expected) {
      problems.push(
        `${name} is ${JSON.stringify(ci[name])} in CI, ${JSON.stringify(expected)} expected` +
          (Object.hasOwn(differ, name) ? ` (from the harness's ${JSON.stringify(value)}).` : ' (the local harness).'),
      );
    }
  }
  for (const name of Object.keys(ci)) {
    if (!Object.hasOwn(harness, name)) {
      problems.push(`${name} is set in CI only; give the local harness the same value or drop it.`);
    }
  }
  for (const name of Object.keys(differ)) {
    if (!Object.hasOwn(harness, name)) {
      problems.push(`The allow-list names ${name}, which the local harness does not set; remove it.`);
    }
  }
  return problems;
}
