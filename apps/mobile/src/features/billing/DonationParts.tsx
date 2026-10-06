import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Donation, Supporter } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { Checkbox } from '@/src/components/ui/FormControls';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { StatusChip } from '@/src/features/offers/StatusChip';
import { formatLongDate } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  DONATION_CURRENCIES,
  DONATION_MESSAGE_MAX,
  DONATION_PRESETS,
  amountLabel,
  donationStatusInfo,
  supporterMonth,
} from './billingLabels';
import {
  donationFormErrors,
  donationRequest,
  parseDonationAmount,
  type DonationFormValue,
} from './donationForm';

/** "$10" for a preset in the chosen currency. */
function presetLabel(amount: number, currency: string): string {
  return amountLabel(amount, currency).replace(/[.,]00(?=\D*$)/, '');
}

/**
 * The donation form (web: `app-donation-form`): a preset or custom amount, the currency, a
 * private message (≤ 280) and the public-thanks opt-in; the API's range errors are shown on the
 * fields.
 */
export function DonationForm({
  busy,
  serverErrors,
  onDonate,
}: {
  busy: boolean;
  serverErrors: { amount: string | null; currency: string | null } | null;
  onDonate: (request: NonNullable<ReturnType<typeof donationRequest>>) => void;
}) {
  const { palette } = useTheme();
  const [value, setValue] = useState<DonationFormValue>({
    preset: '10',
    custom: '',
    currency: DONATION_CURRENCIES[0] ?? 'CAD',
    message: '',
    publicThanks: false,
  });
  const [touched, setTouched] = useState(false);
  const errors = touched ? donationFormErrors(value) : {};
  const update = (patch: Partial<DonationFormValue>) =>
    setValue((current) => ({ ...current, ...patch }));
  const amount = parseDonationAmount(value.preset === 'other' ? value.custom : value.preset);
  const submitLabel = amount ? `Donate ${amountLabel(amount, value.currency)}` : 'Donate';

  return (
    <View style={styles.form} testID="donation-form">
      <ChoiceChips
        label="Amount"
        options={[
          ...DONATION_PRESETS.map((preset) => ({
            value: String(preset),
            label: presetLabel(preset, value.currency),
          })),
          { value: 'other', label: 'Other' },
        ]}
        value={value.preset}
        onChange={(preset: string) => update({ preset })}
        disabled={busy}
        testID="donation-preset"
      />
      {value.preset === 'other' ? (
        <TextField
          label="Your amount"
          value={value.custom}
          onChangeText={(custom) => update({ custom })}
          keyboardType="decimal-pad"
          inputMode="decimal"
          error={errors.custom ?? serverErrors?.amount ?? null}
          editable={!busy}
          testID="donation-custom-amount"
        />
      ) : serverErrors?.amount ? (
        <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
          {serverErrors.amount}
        </Text>
      ) : null}
      <SelectSheet
        label="Currency"
        options={DONATION_CURRENCIES.map((code) => ({ value: code, label: code }))}
        value={value.currency}
        onChange={(currency) => update({ currency })}
        disabled={busy}
        testID="donation-currency"
      />
      {serverErrors?.currency ? (
        <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
          {serverErrors.currency}
        </Text>
      ) : null}
      <TextField
        label="Message (optional)"
        value={value.message}
        onChangeText={(message) => update({ message })}
        multiline
        maxLength={DONATION_MESSAGE_MAX + 20}
        error={errors.message ?? null}
        hint={`Only the OrenjiTrade team reads it; it is never published. ${value.message.length} / ${DONATION_MESSAGE_MAX}`}
        editable={!busy}
        testID="donation-message"
      />
      <Checkbox
        label="Thank me publicly: show my display name on the supporters list (never the amount or the message)."
        checked={value.publicThanks}
        onChange={(publicThanks) => update({ publicThanks })}
        disabled={busy}
        testID="donation-public-thanks"
      />
      <Button
        label={submitLabel}
        icon="hand-heart-outline"
        loading={busy}
        loadingLabel="Opening the checkout…"
        onPress={() => {
          setTouched(true);
          const request = donationRequest(value);
          if (request && Object.keys(donationFormErrors(value)).length === 0) {
            onDonate(request);
          }
        }}
        testID="donation-submit"
      />
    </View>
  );
}

/** The public thank-you wall (web: `app-supporters-list`): display names and months only. */
export function SupportersList({ supporters }: { supporters: readonly Supporter[] }) {
  const { palette } = useTheme();
  if (supporters.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="supporters-empty">
        Be the first name on the wall: tick “Thank me publicly” when you give.
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityLabel="Supporters">
      {supporters.map((supporter, index) => (
        <View key={`${supporter.displayName}-${index}`} style={styles.row} testID="supporter">
          <Avatar name={supporter.displayName ?? ''} size={32} />
          <View style={styles.grow}>
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
              {supporter.displayName}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {supporterMonth(supporter.month)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** The member's own donations (web: `app-my-donations`). */
export function MyDonations({ donations }: { donations: readonly Donation[] }) {
  const { palette } = useTheme();
  if (donations.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="my-donations-empty">
        You have not donated yet. Every bit helps keep OrenjiTrade running.
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityLabel="Your donations">
      {donations.map((donation) => (
        <View
          key={donation.id}
          testID="my-donation"
          style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}
        >
          <View style={styles.row}>
            <Text style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}>
              {amountLabel(donation.amount, donation.currency)}
            </Text>
            <StatusChip info={donationStatusInfo(donation.status)} />
          </View>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {formatLongDate(donation.createdAt)}
            {donation.publicThanks ? ' · thanked publicly' : ''}
            {donation.message ? ` · “${donation.message}”` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[3] },
  list: { gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[1] },
});
