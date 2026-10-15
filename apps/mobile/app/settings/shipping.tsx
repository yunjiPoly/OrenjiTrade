import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { SHIPPING_DETAILS_COPY } from '@/src/features/messages/chatCopy';
import {
  SAVED_DETAIL_MAX,
  useSavedDetails,
  type SavedDetailKind,
} from '@/src/features/shipping/savedDetails';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Settings › Shipping details (owner spec 2026-10-14, sections 9, 10 and 13): the address "Send my
 * address" puts into a chat's message box and the e-Transfer email or phone number of "Send my
 * e-Transfer email". Both stay on this phone only (its secure storage), are never sent to
 * OrenjiTrade except inside a message the collector checks and sends, and can be deleted here.
 */
export default function ShippingDetailsScreen() {
  const saved = useSavedDetails();
  return (
    <Screen scroll safeBottom testID="screen-settings-shipping">
      {saved.loaded ? (
        <ShippingForm address={saved.address ?? ''} etransfer={saved.etransfer ?? ''} />
      ) : (
        <SkeletonList rows={2} rowHeight={96} testID="shipping-loading" />
      )}
    </Screen>
  );
}

function ShippingForm({ address, etransfer }: { address: string; etransfer: string }) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const saved = useSavedDetails();
  const [draft, setDraft] = useState({ address, etransfer });
  const [busy, setBusy] = useState(false);
  const changed = draft.address !== address || draft.etransfer !== etransfer;

  const saveAll = async () => {
    setBusy(true);
    try {
      const address_ = await saved.save('address', draft.address);
      const etransfer_ = await saved.save('etransfer', draft.etransfer);
      setDraft({ address: address_ ?? '', etransfer: etransfer_ ?? '' });
      snackbar.show(SHIPPING_DETAILS_COPY.saved);
    } catch {
      snackbar.show(SHIPPING_DETAILS_COPY.unavailable, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const clear = async (kind: SavedDetailKind) => {
    try {
      await saved.clear(kind);
      setDraft((current) => ({ ...current, [kind]: '' }));
      snackbar.show(SHIPPING_DETAILS_COPY.cleared);
    } catch {
      snackbar.show(SHIPPING_DETAILS_COPY.unavailable, { tone: 'error' });
    }
  };

  return (
    <View style={styles.form}>
      <Text testID="shipping-intro" style={[textStyle('sm'), { color: palette.textMuted }]}>
        {SHIPPING_DETAILS_COPY.intro}
      </Text>
      <SectionCard>
        <View style={styles.section}>
          <TextField
            label={SHIPPING_DETAILS_COPY.address}
            hint={SHIPPING_DETAILS_COPY.addressHint}
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
          {address ? (
            <Button
              label={SHIPPING_DETAILS_COPY.clear}
              variant="ghost"
              onPress={() => void clear('address')}
              testID="shipping-address-clear"
            />
          ) : null}
        </View>
      </SectionCard>
      <SectionCard>
        <View style={styles.section}>
          <TextField
            label={SHIPPING_DETAILS_COPY.etransfer}
            hint={SHIPPING_DETAILS_COPY.etransferHint}
            value={draft.etransfer}
            onChangeText={(value) => setDraft((current) => ({ ...current, etransfer: value }))}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            maxLength={SAVED_DETAIL_MAX.etransfer}
            testID="shipping-etransfer"
          />
          {etransfer ? (
            <Button
              label={SHIPPING_DETAILS_COPY.clear}
              variant="ghost"
              onPress={() => void clear('etransfer')}
              testID="shipping-etransfer-clear"
            />
          ) : null}
        </View>
      </SectionCard>
      <Button
        label={changed ? SHIPPING_DETAILS_COPY.save : SHIPPING_DETAILS_COPY.noChanges}
        disabled={!changed}
        loading={busy}
        onPress={() => void saveAll()}
        testID="shipping-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4] },
  section: { gap: spacing[2], padding: spacing[3] },
  address: { minHeight: 96, textAlignVertical: 'top' },
});
