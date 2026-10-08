import type { ApiError } from '@/src/api/ApiError';
import type {
  GameResponse,
  MyProfileResponse,
  TagResponse,
  UpdateProfileRequest,
} from '@/src/api/types';

/**
 * Profile rules shared by onboarding and the profile editor (mirror of the web's
 * `shared/profile/profile-form.ts`, `domain/games.ts` and the tag picker limits).
 */

/** Handle rules mirrored from the API (`HandleRules`): 3–24 of `[a-z0-9_]`. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 24;
export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 500;

/** API limits for profile tags (`PUT /me/profile/tags`). */
export const MAX_PROFILE_TAGS = 12;
export const CUSTOM_TAG_MIN = 2;
export const CUSTOM_TAG_MAX = 24;

export interface ProfileDraft {
  handle: string;
  displayName: string;
  bio: string;
}

export interface ProfileErrors {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
}

export const NO_PROFILE_ERRORS: ProfileErrors = { handle: null, displayName: null, bio: null };

export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const handle = draft.handle.trim().toLowerCase();
  return {
    handle: !handle
      ? 'Choose a handle.'
      : handle.length < HANDLE_MIN
        ? `Use at least ${HANDLE_MIN} characters.`
        : !HANDLE_PATTERN.test(handle)
          ? 'Only lowercase letters, digits and underscores.'
          : null,
    displayName: !draft.displayName.trim()
      ? 'Enter a display name.'
      : draft.displayName.trim().length > DISPLAY_NAME_MAX
        ? `Use at most ${DISPLAY_NAME_MAX} characters.`
        : null,
    bio: draft.bio.length > BIO_MAX ? `Use at most ${BIO_MAX} characters.` : null,
  };
}

export function draftOf(profile: MyProfileResponse | undefined, fallbackName = ''): ProfileDraft {
  return {
    handle: profile?.handle ?? '',
    displayName: profile?.displayName || fallbackName,
    bio: profile?.bio ?? '',
  };
}

/** Full `PUT /me/profile` body (the endpoint replaces every editable field). */
export function profileRequest(
  draft: ProfileDraft,
  games: readonly string[],
  languages: readonly string[]
): UpdateProfileRequest {
  return {
    handle: draft.handle.trim().toLowerCase(),
    displayName: draft.displayName.trim(),
    bio: draft.bio.trim() || null,
    games: [...games],
    languages: [...languages],
  };
}

/**
 * Server validation mapped onto the form: 409 `HANDLE_TAKEN` on the handle, 400 field errors on
 * their fields. Returns null when nothing could be mapped (show the friendly message instead).
 */
export function profileServerErrors(error: ApiError): ProfileErrors | null {
  if (error.errorCode === 'HANDLE_TAKEN') {
    return { ...NO_PROFILE_ERRORS, handle: 'That handle is already taken. Try another one.' };
  }
  const errors: ProfileErrors = { ...NO_PROFILE_ERRORS };
  let mapped = false;
  for (const field of ['handle', 'displayName', 'bio'] as const) {
    const message = error.fieldErrors[field];
    if (message) {
      errors[field] = message;
      mapped = true;
    }
  }
  return mapped ? errors : null;
}

/** Splits saved tags into curated tags and custom labels (the API returns both as tags). */
export function splitTags(tags: readonly TagResponse[]): {
  curated: TagResponse[];
  custom: string[];
} {
  return {
    curated: tags.filter((tag) => tag.category !== 'CUSTOM'),
    custom: tags.filter((tag) => tag.category === 'CUSTOM').map((tag) => tag.label),
  };
}

/** A typed query that can become a custom tag, or null (too short/long or already present). */
export function customTagCandidate(query: string, existing: readonly string[]): string | null {
  const label = query.trim().replace(/\s+/g, ' ');
  if (label.length < CUSTOM_TAG_MIN || label.length > CUSTOM_TAG_MAX) {
    return null;
  }
  const lower = label.toLowerCase();
  return existing.some((value) => value.toLowerCase() === lower) ? null : label;
}

export interface GameInfo {
  slug: string;
  label: string;
}

/** The MVP games (fallback while `GET /games` loads or when it fails). */
export const GAMES: readonly GameInfo[] = [
  { slug: 'pokemon', label: 'Pokémon' },
  { slug: 'yugioh', label: 'Yu-Gi-Oh!' },
  { slug: 'mtg', label: 'Magic: The Gathering' },
  { slug: 'riftbound', label: 'Riftbound' },
];

/** Games of the picker: the API list (hidden games disappear), else the built-in list. */
export function gamesFrom(api: readonly GameResponse[] | undefined): readonly GameInfo[] {
  if (!api) {
    return GAMES;
  }
  return api
    .filter((game): game is GameResponse & { slug: string } => !!game.slug)
    .map((game) => ({
      slug: game.slug,
      label:
        GAMES.find((known) => known.slug === game.slug)?.label ??
        game.shortName ??
        game.name ??
        game.slug,
    }));
}

export function gameLabel(slug: string): string {
  return GAMES.find((game) => game.slug === slug)?.label ?? slug;
}

/** Languages offered in the profile editor (ISO 639-1). */
export const PROFILE_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
];

export function languageLabel(code: string): string {
  return PROFILE_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

/** Initials for avatars: first letters of the first two words, or of the handle. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .trim()
    .split(/[\s._\-@'!?,()]+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0] ?? '';
  const second = words[1] ?? '';
  const letters = words.length === 1 ? first.slice(0, 2) : `${first[0] ?? ''}${second[0] ?? ''}`;
  return letters.toUpperCase();
}

/** Last-active buckets of public profiles (never an exact time). */
export const LAST_ACTIVE_LABELS: Readonly<Record<string, string>> = {
  TODAY: 'Active today',
  THIS_WEEK: 'Active this week',
  THIS_MONTH: 'Active this month',
  LONGER_AGO: 'Active a while ago',
  HIDDEN: 'Activity hidden',
};
