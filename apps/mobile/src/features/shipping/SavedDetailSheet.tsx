import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Button } from '@/src/components/ui/Button';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { SAVED_DETAIL_COPY } from '@/src/features/messages/chatCopy';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { SAVED_DETAIL_MAX, type SavedDetailKind } from './savedDetails';

/**
 * The first time "Send my address" or "Send my e-Transfer email" is tapped (owner spec
 * 2026-10-14, section 10): one field (the address on several lines, or the email or phone number),
 * saved on this phone only, then put into the message box to be checked before sending.
 */
export function SavedDetailSheet({
  kind,
  onSave,
  onClose,
}: {
  /** The detail asked for; `null` while the sheet is closed. */
  kind: SavedDetailKind | null;
  onSave: (kind: SavedDetailKind, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A new question starts empty (render-time reset, no effect).
  const [asked, setAsked] = useState(kind);
  if (asked !== kind) {
    setAsked(kind);
    setValue('');
    setProblem(null);
  }
  const address = kind === 'address';
  const max = kind ? SAVED_DETAIL_MAX[kind] : 0;

  const submit = async () => {
    if (!kind) {
      return;
    }
    if (!value.trim()) {
      setProblem(SAVED_DETAIL_COPY.required);
      return;
    }
    if (value.length > max) {
      setProblem(SAVED_DETAIL_COPY.tooLong(max));
      return;
    }
    setSaving(true);
    try {
      await onSave(kind, value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={kind !== null}
      onClose={onClose}
      title={address ? SAVED_DETAIL_COPY.addressTitle : SAVED_DETAIL_COPY.etransferTitle}
      testID="saved-detail-sheet"
    >
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{SAVED_DETAIL_COPY.hint}</Text>
      <TextField
        label={address ? SAVED_DETAIL_COPY.addressLabel : SAVED_DETAIL_COPY.etransferLabel}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          setProblem(null);
        }}
        placeholder={
          address ? SAVED_DETAIL_COPY.addressPlaceholder : SAVED_DETAIL_COPY.etransferPlaceholder
        }
        multiline={address}
        autoCapitalize={address ? 'words' : 'none'}
        autoCorrect={false}
        autoComplete={address ? 'street-address' : 'email'}
        keyboardType={address ? 'default' : 'email-address'}
        maxLength={max}
        error={problem}
        inputStyle={address ? styles.address : undefined}
        testID="saved-detail-input"
      />
      <View style={styles.buttons}>
        <Button
          label={SAVED_DETAIL_COPY.save}
          onPress={() => void submit()}
          loading={saving}
          testID="saved-detail-save"
        />
        <Button
          label={SAVED_DETAIL_COPY.cancel}
          variant="secondary"
          onPress={onClose}
          testID="saved-detail-cancel"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  address: { minHeight: 96, textAlignVertical: 'top' },
  buttons: { gap: spacing[2] },
});
