import type { TagResponse } from '@/src/api/types';
import type { ToggleChip } from '@/src/features/onboarding/ToggleChips';
import { MAX_PROFILE_TAGS } from '@/src/lib/profile';

import type { ProfileEditor } from './useProfileEditor';

/** The tags a page shows: those saved or picked during this visit, so an unpicked one stays. */
export interface KnownTags {
  tags: TagResponse[];
  custom: string[];
}

/** The chips of the page's tags: picked ones filled; unpicked ones greyed while 12 are picked. */
export function profileTagChips(
  known: KnownTags,
  editor: Pick<ProfileEditor, 'tags' | 'customTags'>
): ToggleChip[] {
  const tags = [...known.tags];
  for (const tag of editor.tags) {
    if (!tags.some((entry) => entry.id === tag.id)) {
      tags.push(tag);
    }
  }
  const custom = [...known.custom];
  for (const label of editor.customTags) {
    if (!custom.includes(label)) {
      custom.push(label);
    }
  }
  const full = editor.tags.length + editor.customTags.length >= MAX_PROFILE_TAGS;
  return [
    ...tags.map((tag) => ({
      key: `tag:${tag.id}`,
      label: tag.label,
      selected: editor.tags.some((entry) => entry.id === tag.id),
      disabled: full,
      testID: `profile-tag-${tag.slug}`,
    })),
    ...custom.map((label) => ({
      key: `custom:${label}`,
      label,
      selected: editor.customTags.includes(label),
      disabled: full,
      testID: `profile-tag-custom-${label}`,
    })),
  ];
}
