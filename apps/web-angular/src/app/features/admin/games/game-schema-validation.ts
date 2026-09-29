import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { GameMetadataFieldTypeEnum, type GameSchema } from '@orenji/api-client';

/** Field types a `GameSchema.metadataFields` entry may declare. */
export const METADATA_FIELD_TYPES: readonly string[] = Object.values(GameMetadataFieldTypeEnum);

const LIST_KEYS = ['conditions', 'editions', 'languages', 'finishes', 'rarities'] as const;
const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const LANGUAGE = /^[a-z]{2}$/;

export interface SchemaValidationResult {
  schema: GameSchema | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value: unknown, path: string, errors: string[], required = true): string[] {
  if (value === undefined && !required) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be a list of text values.`);
    return [];
  }
  const items: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      errors.push(`${path}[${index}] must be non-empty text.`);
    } else if (items.includes(item)) {
      errors.push(`${path} lists “${item}” twice.`);
    } else {
      items.push(item);
    }
  });
  return items;
}

/**
 * Parses and checks a `GameSchema` JSON document the way the API does: every list present,
 * non-empty text values without duplicates, ISO 639-1 languages, metadata fields with a unique
 * key, a label and a known type, and summary fields that name declared metadata fields.
 */
export function validateGameSchemaJson(text: string): SchemaValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    return { schema: null, errors: [`Not valid JSON: ${detail}`] };
  }
  if (!isRecord(parsed)) {
    return { schema: null, errors: ['The schema must be a JSON object.'] };
  }
  const errors: string[] = [];
  const lists = Object.fromEntries(
    LIST_KEYS.map((key) => {
      const values = stringList(parsed[key], key, errors);
      if (Array.isArray(parsed[key]) && values.length === 0) {
        errors.push(`${key} needs at least one value.`);
      }
      return [key, values];
    }),
  ) as Record<(typeof LIST_KEYS)[number], string[]>;
  for (const language of lists.languages) {
    if (!LANGUAGE.test(language)) {
      errors.push(`languages: “${language}” is not a two-letter ISO 639-1 code.`);
    }
  }

  const fields: GameSchema['metadataFields'] = [];
  const rawFields = parsed['metadataFields'];
  if (!Array.isArray(rawFields)) {
    errors.push('metadataFields must be a list.');
  } else {
    rawFields.forEach((raw, index) => {
      const path = `metadataFields[${index}]`;
      if (!isRecord(raw)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      const key = raw['key'];
      const label = raw['label'];
      const type = raw['type'];
      if (typeof key !== 'string' || !FIELD_KEY.test(key)) {
        errors.push(`${path}.key must start with a letter and use letters, digits or _.`);
      } else if (fields.some((field) => field.key === key)) {
        errors.push(`${path}.key “${key}” is declared twice.`);
      }
      if (typeof label !== 'string' || !label.trim()) {
        errors.push(`${path}.label is required.`);
      }
      if (typeof type !== 'string' || !METADATA_FIELD_TYPES.includes(type)) {
        errors.push(`${path}.type must be one of ${METADATA_FIELD_TYPES.join(', ')}.`);
      }
      if (raw['filterable'] !== undefined && typeof raw['filterable'] !== 'boolean') {
        errors.push(`${path}.filterable must be true or false.`);
      }
      const options = stringList(raw['options'], `${path}.options`, errors, false);
      fields.push({
        key: String(key ?? ''),
        label: String(label ?? ''),
        type: type as GameMetadataFieldTypeEnum,
        ...(raw['filterable'] !== undefined ? { filterable: raw['filterable'] === true } : {}),
        ...(raw['options'] !== undefined ? { options } : {}),
      });
    });
  }

  const summary = stringList(parsed['summaryFields'], 'summaryFields', errors);
  for (const key of summary) {
    if (!fields.some((field) => field.key === key)) {
      errors.push(`summaryFields: “${key}” is not a declared metadata field.`);
    }
  }

  if (errors.length) {
    return { schema: null, errors };
  }
  return {
    schema: { ...lists, metadataFields: fields, summaryFields: summary },
    errors: [],
  };
}

/** Form validator: `{ schema: string[] }` with every problem found. */
export function gameSchemaValidator(): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value ?? '';
    if (!value.trim()) {
      return { schema: ['The schema is required.'] };
    }
    const { errors } = validateGameSchemaJson(value);
    return errors.length ? { schema: errors } : null;
  };
}

export function formatSchema(schema: GameSchema | null | undefined): string {
  return JSON.stringify(schema ?? {}, null, 2);
}
