import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useSaveProfile, useSaveTags } from '@/src/api/hooks/profile';
import type { MyProfileResponse, TagResponse } from '@/src/api/types';
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
  /** A message that belongs to no field (network, rate limit, ...). */
  formError: string | null;
  detailsDirty: boolean;
  tagsDirty: boolean;
  hasInterests: boolean;
  saving: 'details' | 'tags' | null;
  /** `PUT /me/profile` (handle, name, bio, games, languages); resolves false when it failed. */
  saveDetails: () => Promise<boolean>;
  /** `PUT /me/profile/tags`; resolves false when it failed. */
  saveTags: () => Promise<boolean>;
}

/**
 * The profile form state shared by onboarding and Settings → Profile (web: the profile form
 * helpers + `MyProfileStore`). Initialised once from `GET /me/profile`.
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
  const [errors, setErrors] = useState<ProfileErrors | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [saving, setSaving] = useState<'details' | 'tags' | null>(null);
  const initialisedFor = useRef<string | null>(profile?.id ?? null);

  // The profile usually arrives after the first render: initialise once.
  useEffect(() => {
    if (!profile || initialisedFor.current === profile.id) {
      return;
    }
    initialisedFor.current = profile.id;
    setDraftState(draftOf(profile, fallbackDisplayName));
    setGamesState(profile.games);
    setLanguagesState(profile.languages);
    const { curated, custom } = splitTags(profile.tags);
    setTagsState(curated);
    setCustomTagsState(custom);
  }, [fallbackDisplayName, profile]);

  const setDraft = useCallback((next: ProfileDraft) => {
    setDraftState(next);
    setDetailsDirty(true);
    setErrors((current) => (current ? validateProfile(next) : current));
  }, []);
  const setGames = useCallback((next: string[]) => {
    setGamesState(next);
    setDetailsDirty(true);
  }, []);
  const setLanguages = useCallback((next: string[]) => {
    setLanguagesState(next);
    setDetailsDirty(true);
  }, []);
  const setTags = useCallback((next: TagResponse[]) => {
    setTagsState(next);
    setTagsDirty(true);
  }, []);
  const setCustomTags = useCallback((next: string[]) => {
    setCustomTagsState(next);
    setTagsDirty(true);
  }, []);

  const saveDetails = async (): Promise<boolean> => {
    const validation = validateProfile(draft);
    if (Object.values(validation).some((value) => value !== null)) {
      setErrors(validation);
      return false;
    }
    setErrors(null);
    setFormError(null);
    setSaving('details');
    try {
      await saveProfile.mutateAsync(profileRequest(draft, games, languages));
      setDetailsDirty(false);
      return true;
    } catch (caught) {
      const mapped = isApiError(caught) ? profileServerErrors(caught) : null;
      if (mapped) {
        setErrors(mapped);
      } else {
        setFormError(
          isApiError(caught) ? friendlyMessage(caught) : 'Something went wrong. Please try again.'
        );
      }
      return false;
    } finally {
      setSaving(null);
    }
  };

  const saveTags = async (): Promise<boolean> => {
    setFormError(null);
    setSaving('tags');
    try {
      await saveTagsMutation.mutateAsync({ tags, customLabels: customTags });
      setTagsDirty(false);
      return true;
    } catch (caught) {
      setFormError(
        isApiError(caught) ? friendlyMessage(caught) : 'Something went wrong. Please try again.'
      );
      return false;
    } finally {
      setSaving(null);
    }
  };

  return {
    draft,
    setDraft,
    games,
    setGames,
    languages,
    setLanguages,
    tags,
    setTags,
    customTags,
    setCustomTags,
    errors,
    formError,
    detailsDirty,
    tagsDirty,
    hasInterests: games.length > 0 || tags.length > 0 || customTags.length > 0,
    saving,
    saveDetails,
    saveTags,
  };
}
