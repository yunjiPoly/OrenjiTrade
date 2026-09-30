import { TestBed } from '@angular/core/testing';
import { NonNullableFormBuilder } from '@angular/forms';
import { ApiError } from '../../core/http/api-error';
import { splitTags } from './my-profile.store';
import { applyProfileServerErrors, createProfileForm, profileRequest } from './profile-form';

function apiError(errorCode: string, fieldErrors: Record<string, string> = {}): ApiError {
  return new ApiError({ errorCode, status: 409, message: 'x', requestId: null, fieldErrors });
}

describe('profile form', () => {
  const form = () => createProfileForm(TestBed.inject(NonNullableFormBuilder));

  it('validates the handle like the API (3–24 of [a-z0-9_])', () => {
    const f = form();
    for (const [handle, valid] of [
      ['maika', true],
      ['ma', false],
      ['Maika', false],
      ['maika-t', false],
      ['a_very_long_handle_1234567', false],
      ['collector_42', true],
    ] as const) {
      f.controls.handle.setValue(handle);
      expect(f.controls.handle.valid, handle).toBe(valid);
    }
  });

  it('builds the full PUT body with trimmed values', () => {
    const f = form();
    f.setValue({ handle: 'Maika ', displayName: '  Maïka  ', bio: '   ' });
    expect(profileRequest(f, ['pokemon'], ['fr'])).toEqual({
      handle: 'maika',
      displayName: 'Maïka',
      bio: null,
      games: ['pokemon'],
      languages: ['fr'],
    });
  });

  it('maps HANDLE_TAKEN and field errors onto the controls', () => {
    const f = form();
    expect(applyProfileServerErrors(f, apiError('HANDLE_TAKEN'))).toBe(true);
    expect(f.controls.handle.hasError('taken')).toBe(true);

    expect(
      applyProfileServerErrors(f, apiError('VALIDATION_FAILED', { displayName: 'too long' })),
    ).toBe(true);
    expect(f.controls.displayName.getError('server')).toBe('too long');

    expect(applyProfileServerErrors(f, apiError('CONFLICT'))).toBe(false);
  });

  it('splits curated tags from custom labels', () => {
    const tag = (label: string, category: string) =>
      ({ id: label, slug: label, label, category, usageCount: 0 }) as never;
    const { curated, custom } = splitTags([tag('Trader', 'ROLE'), tag('Cube drafter', 'CUSTOM')]);
    expect(curated.map((t: { label: string }) => t.label)).toEqual(['Trader']);
    expect(custom).toEqual(['Cube drafter']);
  });
});
