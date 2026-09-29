import type { GameMetadataField } from '@orenji/api-client';

/** Form value of one metadata field: text for numbers/strings, a list, or a boolean. */
export type MetadataFormValue = string | string[] | boolean;

/** Initial form values for the game's declared fields. */
export function metadataFormValues(
  fields: readonly GameMetadataField[],
  metadata: Record<string, unknown> | null | undefined,
): Record<string, MetadataFormValue> {
  const values: Record<string, MetadataFormValue> = {};
  for (const field of fields) {
    const raw = metadata?.[field.key];
    switch (field.type) {
      case 'boolean':
        values[field.key] = raw === true || raw === 'true';
        break;
      case 'string_list':
        values[field.key] = Array.isArray(raw)
          ? raw.map((item) => String(item))
          : typeof raw === 'string' && raw
            ? [raw]
            : [];
        break;
      default:
        values[field.key] = raw === null || raw === undefined ? '' : String(raw);
    }
  }
  return values;
}

/** Error message for a field value, or `null`. */
export function metadataFieldError(
  field: GameMetadataField,
  value: MetadataFormValue,
): string | null {
  if (field.type === 'number' && typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value)) ? null : `${field.label} must be a number.`;
  }
  return null;
}

/**
 * Metadata to send: declared fields converted to their types (empty values dropped), undeclared
 * keys of the original metadata kept untouched.
 */
export function metadataFromForm(
  fields: readonly GameMetadataField[],
  values: Record<string, MetadataFormValue>,
  original: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const declared = new Set(fields.map((field) => field.key));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(original ?? {})) {
    if (!declared.has(key)) {
      result[key] = value;
    }
  }
  for (const field of fields) {
    const value = values[field.key];
    switch (field.type) {
      case 'boolean':
        if (typeof value === 'boolean') {
          result[field.key] = value;
        }
        break;
      case 'string_list': {
        const list = (Array.isArray(value) ? value : String(value ?? '').split(','))
          .map((item) => item.trim())
          .filter(Boolean);
        if (list.length) {
          result[field.key] = list;
        }
        break;
      }
      case 'number': {
        const text = String(value ?? '').trim();
        if (text !== '' && Number.isFinite(Number(text))) {
          result[field.key] = Number(text);
        }
        break;
      }
      default: {
        const text = String(value ?? '').trim();
        if (text) {
          result[field.key] = text;
        }
      }
    }
  }
  return result;
}
