import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import type { BinderKind, BinderResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { FormMessage } from '@/src/components/ui/FormControls';
import { TextField } from '@/src/components/ui/TextField';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { BINDER_KIND_LABELS, BINDER_KINDS } from '@/src/lib/inventory';
import { isLimitReached } from '@/src/lib/limits';
import { spacing, textStyle, useTheme } from '@/src/theme';

export const BINDER_NAME_MAX = 80;
export const BINDER_DESCRIPTION_MAX = 1000;

export interface BinderDraft {
  name: string;
  kind: BinderKind;
  description: string;
}

export interface BinderDraftErrors {
  name?: string;
  description?: string;
}

export function binderDraft(binder?: BinderResponse | null): BinderDraft {
  return {
    name: binder?.name ?? '',
    kind: binder?.kind ?? 'TRADE',
    description: binder?.description ?? '',
  };
}

/** Inline errors (the API's bounds: a name of 1–80 characters, a description up to 1000). */
export function validateBinderDraft(draft: BinderDraft): BinderDraftErrors {
  const errors: BinderDraftErrors = {};
  const name = draft.name.trim();
  if (!name) {
    errors.name = 'Give your binder a name.';
  } else if (name.length > BINDER_NAME_MAX) {
    errors.name = `Use at most ${BINDER_NAME_MAX} characters.`;
  }
  if (draft.description.length > BINDER_DESCRIPTION_MAX) {
    errors.description = `Use at most ${BINDER_DESCRIPTION_MAX} characters.`;
  }
  return errors;
}

export interface BinderFormProps {
  initial: BinderDraft;
  editing: boolean;
  saving: boolean;
  /** Saves the trimmed draft; rejects with the ApiError to explain. */
  onSave: (draft: BinderDraft) => Promise<void>;
  onCancel: () => void;
}

/**
 * Create or edit a binder (web: `app-binder-form-dialog`): name, kind, description. A reached
 * `binders.max` (429 LIMIT_REACHED) is explained in place with the plan's numbers.
 */
export function BinderForm({ initial, editing, saving, onSave, onCancel }: BinderFormProps) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState<BinderDraft>(initial);
  const [errors, setErrors] = useState<BinderDraftErrors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);

  const save = async () => {
    const found = validateBinderDraft(draft);
    setErrors(found);
    setFailure(null);
    if (found.name || found.description) {
      return;
    }
    try {
      await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() });
    } catch (error) {
      const apiError = error as ApiError;
      setFailure(apiError);
      const name = apiError.fieldErrors?.name;
      if (name) {
        setErrors({ name });
      }
    }
  };

  return (
    <View style={styles.root}>
      {editing ? null : (
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          New binders are private. Fill them first, then publish when you are ready.
        </Text>
      )}
      <TextField
        label="Binder name"
        value={draft.name}
        onChangeText={(name) => {
          setDraft((current) => ({ ...current, name }));
          setErrors((current) => ({ ...current, name: undefined }));
        }}
        maxLength={BINDER_NAME_MAX}
        error={errors.name}
        hint={`${draft.name.length} / ${BINDER_NAME_MAX}`}
        editable={!saving}
        testID="binder-name"
      />
      <ChoiceChips
        label="Kind"
        options={BINDER_KINDS.map((kind) => ({ value: kind, label: BINDER_KIND_LABELS[kind] }))}
        value={draft.kind}
        onChange={(kind) => setDraft((current) => ({ ...current, kind }))}
        disabled={saving}
        testID="binder-kind"
      />
      <TextField
        label="Description (optional)"
        value={draft.description}
        onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
        multiline
        maxLength={BINDER_DESCRIPTION_MAX}
        hint="Shown on the public binder page."
        error={errors.description}
        editable={!saving}
        testID="binder-description"
      />
      {failure && isLimitReached(failure) ? (
        <LimitReachedNotice
          error={failure}
          title="You reached the number of binders your plan allows"
          testID="binder-limit"
        />
      ) : failure ? (
        <FormMessage testID="binder-error">{friendlyMessage(failure)}</FormMessage>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="ghost"
          onPress={onCancel}
          disabled={saving}
          testID="binder-cancel"
        />
        <Button
          label={editing ? 'Save binder' : 'Create binder'}
          loadingLabel="Saving…"
          loading={saving}
          onPress={() => void save()}
          style={styles.grow}
          testID="binder-save"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  actions: { flexDirection: 'row', gap: spacing[2] },
  grow: { flex: 1 },
});
