import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { SHIPPING_DETAILS_COPY as COPY } from '@/src/features/messages/chatCopy';
import { SettingsNote, useNoteTextStyle } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import {
  SAVED_DETAIL_MAX,
  useSavedDetails,
  type SavedDetailKind,
} from '@/src/features/shipping/savedDetails';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

/**
 * Settings › Shipping details (owner spec 2026-10-14, sections 9, 10 and 13; stage R13, mockup
 * v50 screen 50): the address "Send my address" puts into a chat's message box and the
 * e-Transfer email or phone number of "Send my e-Transfer email". Both stay on this phone only
 * (its secure storage), are never sent to OrenjiTrade except inside a message the collector
 * checks and sends, and can be deleted here; deleting the account wipes them too.
 */
export default function ShippingDetailsScreen() {
  const saved = useSavedDetails();
  if (saved.loaded) {
    return <ShippingForm address={saved.address ?? ''} etransfer={saved.etransfer ?? ''} />;
  }
  return (
    <SettingsPage title={COPY.title} testID="screen-settings-shipping">
      <SkeletonList rows={2} rowHeight={96} testID="shipping-loading" />
    </SettingsPage>
  );
}

function ShippingForm({ address, etransfer }: { address: string; etransfer: string }) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const saved = useSavedDetails();
  const noteText = useNoteTextStyle();
  const [draft, setDraft] = useState({ address, etransfer });
  const [busy, setBusy] = useState(false);
  const changed = draft.address !== address || draft.etransfer !== etransfer;
  const [before, after] = COPY.intro.split(COPY.introStrong);

  const saveAll = async () => {
    setBusy(true);
    try {
      const address_ = await saved.save('address', draft.address);
      const etransfer_ = await saved.save('etransfer', draft.etransfer);
      setDraft({ address: address_ ?? '', etransfer: etransfer_ ?? '' });
      snackbar.show(COPY.saved, { icon: 'success' });
    } catch {
      snackbar.show(COPY.unavailable, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const clear = async (kind: SavedDetailKind) => {
    try {
      await saved.clear(kind);
      setDraft((current) => ({ ...current, [kind]: '' }));
      snackbar.show(COPY.cleared, { icon: 'deleted' });
    } catch {
      snackbar.show(COPY.unavailable, { tone: 'error' });
    }
  };

  const deleteButton = (kind: SavedDetailKind) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${COPY.clear}: ${kind === 'address' ? COPY.address : COPY.etransfer}`}
      onPress={() => void clear(kind)}
      hitSlop={8}
      testID={`shipping-${kind}-clear`}
      style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
    >
      <Text style={[styles.clearText, { color: palette.danger }]}>{COPY.clear}</Text>
    </Pressable>
  );

  return (
    <SettingsPage
      title={COPY.title}
      testID="screen-settings-shipping"
      footer={
        <PillButton
          label={changed ? COPY.save : COPY.noChanges}
          disabled={!changed}
          loading={busy}
          onPress={() => void saveAll()}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="shipping-save"
        />
      }
    >
      <SettingsNote icon="cellphone-lock">
        <Text testID="shipping-intro" style={noteText}>
          {before}
          <Text style={[styles.strong, { color: palette.ink }]}>{COPY.introStrong}</Text>
          {after}
        </Text>
      </SettingsNote>
      <View style={styles.field}>
        <TextField
          label={COPY.address}
          hint={COPY.addressHint}
          value={draft.address}
          onChangeText={(value) => setDraft((current) => ({ ...current, address: value }))}
          multiline
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="street-address"
          maxLength={SAVED_DETAIL_MAX.address}
          inputStyle={styles.address}
          testID="shipping-address"
        />
        {address ? deleteButton('address') : null}
      </View>
      <View style={styles.field}>
        <TextField
          label={COPY.etransfer}
          hint={COPY.etransferHint}
          value={draft.etransfer}
          onChangeText={(value) => setDraft((current) => ({ ...current, etransfer: value }))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          maxLength={SAVED_DETAIL_MAX.etransfer}
          testID="shipping-etransfer"
        />
        {etransfer ? deleteButton('etransfer') : null}
      </View>
      <Text style={[styles.footnote, { color: palette.settings.chevron }]}>
        {COPY.wipedWithAccount}
      </Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: fontWeight.semibold },
  field: { gap: spacing[1] },
  address: { minHeight: 96, textAlignVertical: 'top' },
  clear: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  clearText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  footnote: { fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
