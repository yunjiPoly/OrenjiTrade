import { StyleSheet, View } from 'react-native';

import { TextField } from '@/src/components/ui/TextField';
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  type ProfileDraft,
  type ProfileErrors,
} from '@/src/lib/profile';
import { spacing } from '@/src/theme';

export interface ProfileFieldsProps {
  value: ProfileDraft;
  onChange: (value: ProfileDraft) => void;
  /** Errors to show (validation after a submit, or the server's). */
  errors: ProfileErrors | null;
  disabled?: boolean;
}

/** Handle, display name and bio with inline validation (web: `app-profile-fields`). */
export function ProfileFields({ value, onChange, errors, disabled }: ProfileFieldsProps) {
  return (
    <View style={styles.fields}>
      <TextField
        label="Handle"
        value={value.handle}
        onChangeText={(handle) => onChange({ ...value, handle: handle.toLowerCase() })}
        error={errors?.handle}
        hint="Lowercase letters, digits and _. It is your profile address."
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={HANDLE_MAX}
        editable={!disabled}
        testID="profile-handle"
      />
      <TextField
        label="Display name"
        value={value.displayName}
        onChangeText={(displayName) => onChange({ ...value, displayName })}
        error={errors?.displayName}
        hint="How other collectors see you."
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX}
        editable={!disabled}
        testID="profile-display-name"
      />
      <TextField
        label="Bio"
        value={value.bio}
        onChangeText={(bio) => onChange({ ...value, bio })}
        error={errors?.bio}
        hint={`${value.bio.length} / ${BIO_MAX}`}
        placeholder="What do you collect? Where do you like to meet?"
        multiline
        numberOfLines={3}
        maxLength={BIO_MAX}
        editable={!disabled}
        testID="profile-bio"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing[4] },
});
