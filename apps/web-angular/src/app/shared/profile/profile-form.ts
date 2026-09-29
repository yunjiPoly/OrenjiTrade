import { FormControl, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';
import { MyProfileResponse, UpdateProfileRequest } from '@orenji/api-client';
import { ApiError } from '../../core/http/api-error';

/** Handle rules mirrored from the API (`HandleRules`): 3–24 of `[a-z0-9_]`. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 500;

export type ProfileForm = FormGroup<{
  handle: FormControl<string>;
  displayName: FormControl<string>;
  bio: FormControl<string>;
}>;

export function createProfileForm(fb: NonNullableFormBuilder): ProfileForm {
  return fb.group({
    handle: [
      '',
      [
        Validators.required,
        Validators.minLength(HANDLE_MIN),
        Validators.maxLength(HANDLE_MAX),
        Validators.pattern(HANDLE_PATTERN),
      ],
    ],
    displayName: ['', [Validators.required, Validators.maxLength(DISPLAY_NAME_MAX)]],
    bio: ['', [Validators.maxLength(BIO_MAX)]],
  });
}

export function patchProfileForm(form: ProfileForm, profile: MyProfileResponse): void {
  form.reset({
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio ?? '',
  });
}

/** Full `PUT /me/profile` body (the endpoint replaces every editable field). */
export function profileRequest(
  form: ProfileForm,
  games: readonly string[],
  languages: readonly string[],
): UpdateProfileRequest {
  const value = form.getRawValue();
  return {
    handle: value.handle.trim().toLowerCase(),
    displayName: value.displayName.trim(),
    bio: value.bio.trim() || null,
    games: [...games],
    languages: [...languages],
  };
}

/**
 * Puts server-side validation onto the form: 409 `HANDLE_TAKEN` becomes a `taken` error on the
 * handle, 400 field errors land on their controls. Returns true when something was mapped.
 */
export function applyProfileServerErrors(form: ProfileForm, error: ApiError): boolean {
  if (error.errorCode === 'HANDLE_TAKEN') {
    form.controls.handle.setErrors({ taken: true });
    form.controls.handle.markAsTouched();
    return true;
  }
  let mapped = false;
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    const control = form.get(field);
    if (control) {
      control.setErrors({ server: message });
      control.markAsTouched();
      mapped = true;
    }
  }
  return mapped;
}
