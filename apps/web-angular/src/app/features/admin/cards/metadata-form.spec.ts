import { GameMetadataField } from '@orenji/api-client';
import { metadataFieldError, metadataFormValues, metadataFromForm } from './metadata-form';

const FIELDS = [
  { key: 'hp', label: 'HP', type: 'number' },
  { key: 'types', label: 'Types', type: 'string_list' },
  { key: 'stage', label: 'Stage', type: 'string' },
  { key: 'promo', label: 'Promo', type: 'boolean' },
] as GameMetadataField[];

describe('metadata form', () => {
  it('turns stored metadata into form values', () => {
    expect(metadataFormValues(FIELDS, { hp: 70, types: ['Fire'], promo: true })).toEqual({
      hp: '70',
      types: ['Fire'],
      stage: '',
      promo: true,
    });
  });

  it('converts form values back to typed metadata and keeps undeclared keys', () => {
    const metadata = metadataFromForm(
      FIELDS,
      { hp: ' 90 ', types: 'Fire, Water ,', stage: '  ', promo: false },
      { hp: 70, artist: 'Fictional' },
    );
    expect(metadata).toEqual({
      artist: 'Fictional',
      hp: 90,
      types: ['Fire', 'Water'],
      promo: false,
    });
  });

  it('flags numbers that are not numbers', () => {
    expect(metadataFieldError(FIELDS[0], 'abc')).toBe('HP must be a number.');
    expect(metadataFieldError(FIELDS[0], '12')).toBeNull();
    expect(metadataFieldError(FIELDS[2], 'abc')).toBeNull();
  });
});
