// Writes src/demo/demoResponses.json: the smallest valid answer of every API operation, built from
// docs/api/openapi.json, for the offline demo build (EXPO_PUBLIC_DEMO=1). Run it again after an API
// change: node apps/mobile/scripts/demo-responses.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '../../../docs/api/openapi.json'), 'utf8'));
const schemas = spec.components?.schemas ?? {};

function minimal(schema, depth = 0) {
  if (!schema || depth > 12) return null;
  if (schema.$ref) return minimal(schemas[schema.$ref.split('/').pop()], depth + 1);
  const variants = schema.oneOf ?? schema.anyOf;
  if (variants) {
    const real = variants.find((v) => v.type !== 'null') ?? variants[0];
    return minimal(real, depth + 1);
  }
  if (schema.allOf) {
    return Object.assign({}, ...schema.allOf.map((part) => minimal(part, depth + 1) ?? {}));
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('null')) return null;
  if (schema.enum) return schema.enum[0];
  switch (types[0]) {
    case 'object': {
      const out = {};
      // Every property, not only the required ones: a screen reads `page.items` even where the
      // schema leaves it optional. Nullable ones are null.
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        out[name] = minimal(property, depth + 1);
      }
      return out;
    }
    case 'array':
      return [];
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return '2026-10-17T12:00:00Z';
      if (schema.format === 'date') return '2026-10-17';
      if (schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
      return 'demo';
    default:
      return schema.properties ? minimal({ ...schema, type: 'object' }, depth) : null;
  }
}

const out = {};
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const op = item[method];
    if (!op) continue;
    const code = Object.keys(op.responses ?? {}).find((c) => c.startsWith('2')) ?? '204';
    const schema = op.responses?.[code]?.content?.['application/json']?.schema;
    out[`${method.toUpperCase()} ${path}`] = {
      status: Number(code),
      body: schema ? minimal(schema) : null,
    };
  }
}
// Single objects the demo fills in by hand (its one card).
const samples = { InventoryItemResponse: minimal(schemas.InventoryItemResponse) };
writeFileSync(
  join(here, '../src/demo/demoResponses.json'),
  JSON.stringify({ operations: out, samples }) + '\n'
);
console.log(`${Object.keys(out).length} operations`);
