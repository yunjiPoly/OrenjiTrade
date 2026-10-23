import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, type ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useSaveProfile, useSaveTags } from '@/src/api/hooks/profile';
import type { MyProfileResponse, TagResponse, UpdateProfileRequest } from '@/src/api/types';
import {
  draftOf,
  profileRequest,
  profileServerErrors,
  splitTags,
  validateProfile,
  type ProfileDraft,
  type ProfileErrors,
} from '@/src/lib/profile';

export interface ProfileEditor {
  draft: ProfileDraft;
  setDraft: (draft: ProfileDraft) => void;
  games: string[];
  setGames: (games: string[]) => void;
  languages: string[];
  setLanguages: (languages: string[]) => void;
  tags: TagResponse[];
  setTags: (tags: TagResponse[]) => void;
  customTags: string[];
  setCustomTags: (labels: string[]) => void;
  /** Field errors (client validation after a save attempt, or the server's). */
  errors: ProfileErrors | null;
  /** A message that belongs to no field (network, rate limit, a refused tag, ...). */
  formError: string | null;
  /** The handle, name, bio, games or languages differ from what is saved. */
  detailsDirty: boolean;
  /** The tags differ from what is saved. */
  tagsDirty: boolean;
  /** Anything differs from what is saved (Edit profile's "Save changes"). */
  dirty: boolean;
  hasInterests: boolean;
  saving: 'details' | 'tags' | 'all' | null;
  /** `PUT /me/profile` (handle, name, bio, games, languages); resolves false when it failed. */
  saveDetails: () => Promise<boolean>;
  /** `PUT /me/profile/tags`; resolves false when it failed. */
  saveTags: () => Promise<boolean>;
  /**
   * Edit profile's one save (stage R13): `PUT /me/profile` with the tags in the same request when
   * they changed, all saved or nothing. Resolves `saved`, or where it was refused: `fields` (a
   * message beside the handle, the name or the bio) or `form` (`formError`).
   */
  save: () => Promise<ProfileSaveOutcome>;
}

/** How Edit profile's one save ended: saved, refused on a field, or refused as a whole. */
export type ProfileSaveOutcome = 'saved' | 'fields' | 'form';

/** What is saved, to tell what changed. */
interface Saved {
  handle: string;
  displayName: string;
  bio: string;
  games: readonly string[];
  languages: readonly string[];
  tagIds: readonly string[];
  customTags: readonly string[];
}

function savedOf(profile: MyProfileResponse | undefined, fallbackName: string): Saved {
  const draft = draftOf(profile, fallbackName);
  const { curated, custom } = splitTags(profile?.tags ?? []);
  return {
    handle: draft.handle.trim().toLowerCase(),
    displayName: draft.displayName.trim(),
    bio: draft.bio.trim(),
    games: profile?.games ?? [],
    languages: profile?.languages ?? [],
    tagIds: curated.map((tag) => tag.id),
    customTags: custom,
  };
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(b);
  return a.length === b.length && a.every((value) => set.has(value));
}

/**
 * Whether the form differs from what is saved: the handle compared as the API keeps it (trimmed,
 * lower case), the name and the bio trimmed, the games and languages in their order (the first
 * game opens first), the tags as a set. Changing a value and back is no change.
 */
export function profileChanges(
  current: {
    draft: ProfileDraft;
    games: readonly string[];
    languages: readonly string[];
    tags: readonly TagResponse[];
    customTags: readonly string[];
  },
  saved: Saved
): { details: boolean; tags: boolean } {
  return {
    details:
      current.draft.handle.trim().toLowerCase() !== saved.handle ||
      current.draft.displayName.trim() !== saved.displayName ||
      current.draft.bio.trim() !== saved.bio ||
      !sameOrder(current.games, saved.games) ||
      !sameOrder(current.languages, saved.languages),
    tags:
      !sameSet(
        current.tags.map((tag) => tag.id),
        saved.tagIds
      ) || !sameSet(current.customTags, saved.customTags),
  };
}

/** The message of a refused tag (`customLabels[n]` or `tagIds` of the save's 400). */
export const TAG_REFUSED =
  'One of your tags cannot be used. Remove it or choose another one, then save again.';

/** Whether a save's 400 names the tags (`tagIds`, `customLabels`, `customLabels[n]`). */
export function isTagProblem(error: ApiError): boolean {
  return Object.keys(error.fieldErrors).some(
    (field) => field.startsWith('customLabels') || field.startsWith('tagIds')
  );
}

/** The body of Edit profile's one save: the fields, and the tags when they changed. */
export function saveBody(
  current: {
    draft: ProfileDraft;
    games: readonly string[];
    languages: readonly string[];
    tags: readonly TagResponse[];
    customTags: readonly string[];
  },
  withTags: boolean
): UpdateProfileRequest {
  const body = profileRequest(current.draft, current.games, current.languages);
  return withTags
    ? {
        ...body,
        tags: { tagIds: current.tags.map((tag) => tag.id), customLabels: [...current.customTags] },
      }
    : body;
}

/**
 * The profile form state shared by the welcome and Edit profile (web: the profile form helpers +
 * `MyProfileStore`). Initialised once from `GET /me/profile`; after a save, what was saved is the
 * new starting point.
 */
export function useProfileEditor(
  profile: MyProfileResponse | undefined,
  fallbackDisplayName = ''
): ProfileEditor {
  const saveProfile = useSaveProfile();
  const saveTagsMutation = useSaveTags();
  const [draft, setDraftState] = useState<ProfileDraft>(() =>
    draftOf(profile, fallbackDisplayName)
  );
  const [games, setGamesState] = useState<string[]>(profile?.games ?? []);
  const [languages, setLanguagesState] = useState<string[]>(profile?.languages ?? []);
  const [tags, setTagsState] = useState<TagResponse[]>(
    () => splitTags(profile?.tags ?? []).curated
  );
  const [customTags, setCustomTagsState] = useState<string[]>(
    () => splitTags(profile?.tags ?? []).custom
  );
  const [saved, setSaved] = useState<Saved>(() => savedOf(profile, fallbackDisplayName));
  const [errors, setErrors] = useState<ProfileErrors | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ProfileEditor['saving']>(null);
  const initialisedFor = useRef<string | null>(profile?.id ?? null);

  /** Takes a saved profile as the form's values and as what is saved. */
  const adopt = useCallback(
    (next: MyProfileResponse) => {
      setDraftState(draftOf(next, fallbackDisplayName));
      setGamesState(next.games);
      setLanguagesState(next.languages);
      const { curated, custom } = splitTags(next.tags);
      setTagsState(curated);
      setCustomTagsState(custom);
      setSaved(savedOf(next, fallbackDisplayName));
    },
    [fallbackDisplayName]
  );

  // The profile usually arrives after the first render: initialise once.
  useEffect(() => {
    if (!profile || initialisedFor.current === profile.id) {
      return;
    }
    initialisedFor.current = profile.id;
    adopt(profile);
  }, [adopt, profile]);

  const setDraft = useCallback((next: ProfileDraft) => {
    setDraftState(next);
    setErrors((current) => (current ? validateProfile(next) : current));
  }, []);

  const current = { draft, games, languages, tags, customTags };
  const changes = profileChanges(current, saved);

  /** Shows why a save failed; says whether that is beside a field or for the whole form. */
  const showFailure = (caught: unknown, fields: boolean): 'fields' | 'form' => {
    const mapped = fields && isApiError(caught) ? profileServerErrors(caught) : null;
    if (mapped) {
      setErrors(mapped);
      return 'fields';
    }
    if (isApiError(caught) && isTagProblem(caught)) {
      setFormError(TAG_REFUSED);
    } else {
      setFormError(
        isApiError(caught) ? friendlyMessage(caught) : 'Something went wrong. Please try again.'
      );
    }
    return 'form';
  };

  const validated = (): boolean => {
    const validation = validateProfile(draft);
    if (Object.values(validation).some((value) => value !== null)) {
      setErrors(validation);
      return false;
    }
    setErrors(null);
    setFormError(null);
    return true;
  };

  const saveDetails = async (): Promise<boolean> => {
    if (!validated()) {
      return false;
    }
    setSaving('details');
    try {
      const answer = await saveProfile.mutateAsync(profileRequest(draft, games, languages));
      setSaved((before) => ({
        ...savedOf(answer, fallbackDisplayName),
        tagIds: before.tagIds,
        customTags: before.customTags,
      }));
      return true;
    } catch (caught) {
      showFailure(caught, true);
      return false;
    } finally {
      setSaving(null);
    }
  };

  const saveTags = async (): Promise<boolean> => {
    setFormError(null);
    setSaving('tags');
    try {
      const answer = await saveTagsMutation.mutateAsync({ tags, customLabels: customTags });
      const { curated, custom } = splitTags(answer);
      setSaved((before) => ({
        ...before,
        tagIds: curated.map((tag) => tag.id),
        customTags: custom,
      }));
      return true;
    } catch (caught) {
      showFailure(caught, false);
      return false;
    } finally {
      setSaving(null);
    }
  };

  const save = async (): Promise<ProfileSaveOutcome> => {
    if (!validated()) {
      return 'fields';
    }
    setSaving('all');
    try {
      adopt(await saveProfile.mutateAsync(saveBody(current, changes.tags)));
      return 'saved';
    } catch (caught) {
      return showFailure(caught, true);
    } finally {
      setSaving(null);
    }
  };

  return {
    draft,
    setDraft,
    games,
    setGames: setGamesState,
    languages,
    setLanguages: setLanguagesState,
    tags,
    setTags: setTagsState,
    customTags,
    setCustomTags: setCustomTagsState,
    errors,
    formError,
    detailsDirty: changes.details,
    tagsDirty: changes.tags,
    dirty: changes.details || changes.tags,
    hasInterests: games.length > 0 || tags.length > 0 || customTags.length > 0,
    saving,
    saveDetails,
    saveTags,
    save,
  };
}
