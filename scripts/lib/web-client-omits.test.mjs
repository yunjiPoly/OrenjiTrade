// The paused web's Angular client leaves out the optional parameters that would change the
// signature of an operation it calls without any (packages/api-client/tools/web-omits.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  WEB_CLIENT_NOT_NULL,
  WEB_CLIENT_OMITS,
  withoutWebNulls,
  withoutWebOmits,
} from '../../packages/api-client/tools/web-omits.mjs';

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
  // Web stage WE sends `excludeTypes` with the unread count (the bell leaves chats out): kept.
  withoutWebOmits(document);
  assert.ok(
    (operations.get('getUnreadNotificationCount').parameters ?? []).some(
      (parameter) => parameter.name === 'excludeTypes'
    )
  );
});

test('the web keeps a collector\'s identity typed as before; others stay nullable', () => {
  const document = {
    components: {
      schemas: {
        Person: {
          properties: {
            handle: { type: ['string', 'null'] },
            avatarUrl: { type: ['string', 'null'], format: 'uri' },
          },
        },
      },
    },
  };
  withoutWebNulls(document, { Person: ['handle', 'missing'] });
  assert.equal(document.components.schemas.Person.properties.handle.type, 'string');
  assert.deepEqual(document.components.schemas.Person.properties.avatarUrl.type, ['string', 'null']);
});

test('every field kept not null is nullable in the OpenAPI document (none is stale)', () => {
  // Stage R15: a signed-out caller never reads who a collector is; the phone's types keep the null.
  const document = JSON.parse(readFileSync(resolve(root, 'docs/api/openapi.json'), 'utf8'));
  for (const [schema, keys] of Object.entries(WEB_CLIENT_NOT_NULL)) {
    for (const key of keys) {
      const property = document.components.schemas[schema]?.properties?.[key];
      assert.ok(property, `${schema}.${key} is in docs/api/openapi.json`);
      assert.ok(
        Array.isArray(property.type) && property.type.includes('null'),
        `${schema}.${key} is nullable`
      );
    }
  }
  withoutWebNulls(document);
  assert.equal(document.components.schemas.CollectorMarker.properties.handle.type, 'string');
});
