import { validateGameSchemaJson } from './game-schema-validation';

const VALID = {
  conditions: ['MINT', 'NEAR_MINT'],
  editions: ['UNLIMITED'],
  languages: ['en', 'fr'],
  finishes: ['NORMAL', 'FOIL'],
  rarities: ['Common', 'Rare'],
  metadataFields: [
    { key: 'hp', label: 'HP', type: 'number', filterable: true },
    { key: 'types', label: 'Types', type: 'string_list', options: ['Fire', 'Water'] },
  ],
  summaryFields: ['hp'],
};

function check(value: unknown): string[] {
  return validateGameSchemaJson(typeof value === 'string' ? value : JSON.stringify(value)).errors;
}

describe('validateGameSchemaJson', () => {
  it('accepts a complete schema and returns it typed', () => {
    const result = validateGameSchemaJson(JSON.stringify(VALID));
    expect(result.errors).toEqual([]);
    expect(result.schema?.metadataFields[1]).toEqual({
      key: 'types',
      label: 'Types',
      type: 'string_list',
      options: ['Fire', 'Water'],
    });
  });

  it('reports invalid JSON and non-objects', () => {
    expect(check('{ "rarities": [')[0]).toMatch(/^Not valid JSON/);
    expect(check('[]')).toEqual(['The schema must be a JSON object.']);
  });

  it('reports missing, empty and duplicated lists and bad languages', () => {
    const errors = check({
      ...VALID,
      conditions: undefined,
      rarities: [],
      editions: ['UNLIMITED', 'UNLIMITED'],
      languages: ['english'],
    });
    expect(errors).toContain('conditions must be a list of text values.');
    expect(errors).toContain('rarities needs at least one value.');
    expect(errors).toContain('editions lists “UNLIMITED” twice.');
    expect(errors).toContain('languages: “english” is not a two-letter ISO 639-1 code.');
  });

  it('checks metadata fields and summary fields', () => {
    const errors = check({
      ...VALID,
      metadataFields: [
        { key: 'hp', label: 'HP', type: 'integer' },
        { key: 'hp', label: '', type: 'number', filterable: 'yes' },
        { key: '1bad', label: 'Bad', type: 'string' },
      ],
      summaryFields: ['power'],
    });
    expect(errors).toContain(
      'metadataFields[0].type must be one of string, number, string_list, boolean.',
    );
    expect(errors).toContain('metadataFields[1].key “hp” is declared twice.');
    expect(errors).toContain('metadataFields[1].label is required.');
    expect(errors).toContain('metadataFields[1].filterable must be true or false.');
    expect(errors).toContain(
      'metadataFields[2].key must start with a letter and use letters, digits or _.',
    );
    expect(errors).toContain('summaryFields: “power” is not a declared metadata field.');
  });
});
