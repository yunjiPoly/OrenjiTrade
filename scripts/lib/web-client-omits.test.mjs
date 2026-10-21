// The paused web's Angular client leaves out the optional parameters that would change the
// signature of an operation it calls without any (packages/api-client/tools/web-omits.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { WEB_CLIENT_OMITS, withoutWebOmits } from '../../packages/api-client/tools/web-omits.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('an omitted parameter leaves the operation without parameters, others keep theirs', () => {
  const document = {
    paths: {
      '/a': {
        get: { operationId: 'onlyOptional', parameters: [{ name: 'excludeTypes', in: 'query' }] },
        post: { operationId: 'other', parameters: [{ name: 'excludeTypes', in: 'query' }] },
      },
      '/b': { get: { operationId: 'mixed', parameters: [{ name: 'x' }, { name: 'y' }] } },
    },
  };
  withoutWebOmits(document, { onlyOptional: ['excludeTypes'], mixed: ['y'] });
  assert.equal(document.paths['/a'].get.parameters, undefined);
  assert.deepEqual(document.paths['/a'].post.parameters, [{ name: 'excludeTypes', in: 'query' }]);
  assert.deepEqual(document.paths['/b'].get.parameters, [{ name: 'x' }]);
});

test('every omission names a parameter the OpenAPI document has (none is stale)', () => {
  const document = JSON.parse(readFileSync(resolve(root, 'docs/api/openapi.json'), 'utf8'));
  const operations = new Map();
  for (const item of Object.values(document.paths)) {
    for (const operation of Object.values(item)) {
      if (operation?.operationId) {
        operations.set(operation.operationId, operation);
      }
    }
  }
  for (const [operationId, names] of Object.entries(WEB_CLIENT_OMITS)) {
    const operation = operations.get(operationId);
    assert.ok(operation, `${operationId} is in docs/api/openapi.json`);
    for (const name of names) {
      assert.ok(
        (operation.parameters ?? []).some((parameter) => parameter.name === name),
        `${operationId} has ${name}`
      );
    }
  }
  // The unread count is called without parameters by the paused web: none left after the filter.
  withoutWebOmits(document);
  assert.equal(operations.get('getUnreadNotificationCount').parameters, undefined);
});
