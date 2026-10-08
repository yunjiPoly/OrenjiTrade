import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { OpenDisputeRequest, ShipTradeRequest } from '@/src/api/types';
import { FormMessage, RadioGroup } from '@/src/components/ui/FormControls';
import { FormDialog } from '@/src/components/ui/FormDialog';
import { TextField } from '@/src/components/ui/TextField';
import {
  DISPUTE_REASONS,
  DISPUTE_TEXT_MAX,
  SHIP_CARRIER_MAX,
  SHIP_NOTES_MAX,
  SHIP_TRACKING_MAX,
  type DisputeReason,
} from '@/src/features/payments/paymentLabels';
import {
  EMPTY_SHIP_FORM,
  disputeFormErrors,
  shipFormErrors,
  toDisputeRequest,
  toShipRequest,
  type DisputeFormValue,
  type ShipFormValue,
} from '@/src/features/payments/protectedForms';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * "Mark as shipped" (seller, PAID protected trades; web: `ShipDialogComponent`): carrier,
 * tracking number and a note for the buyer. Confirms with the `POST /trades/{id}/ship` body.
 */
export function ShipDialog({
  visible,
  buyerName,
  cardName,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  buyerName: string;
  cardName: string;
  busy: boolean;
  onConfirm: (request: ShipTradeRequest) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<ShipFormValue>(EMPTY_SHIP_FORM);
  // Every opening starts empty (state adjusted while rendering, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setValue(EMPTY_SHIP_FORM);
    }
  }
  const errors = shipFormErrors(value);
  const update = (patch: Partial<ShipFormValue>) =>
    setValue((current) => ({ ...current, ...patch }));
  return (
    <FormDialog
      visible={visible}
      title="Mark as shipped"
      message={`Ship ${cardName} to ${buyerName}, then share how to follow it. Tracking protects you both if something goes wrong.`}
      confirmLabel="Mark as shipped"
      busy={busy}
      onConfirm={() => {
        if (Object.keys(errors).length === 0) {
          onConfirm(toShipRequest(value));
        }
      }}
      onCancel={onCancel}
      testID="ship-dialog"
    >
      <TextField
        label="Carrier"
        value={value.carrier}
        onChangeText={(carrier) => update({ carrier })}
        placeholder="Canada Post"
        autoComplete="off"
        maxLength={SHIP_CARRIER_MAX + 10}
        error={errors.carrier}
        editable={!busy}
        testID="ship-carrier"
      />
      <TextField
        label="Tracking number"
        value={value.trackingNumber}
        onChangeText={(trackingNumber) => update({ trackingNumber })}
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={SHIP_TRACKING_MAX + 10}
        error={errors.trackingNumber}
        editable={!busy}
        testID="ship-tracking"
      />
      <TextField
        label={`Note to ${buyerName} (optional)`}
        value={value.notes}
        onChangeText={(notes) => update({ notes })}
        placeholder="Packed in a top loader and a bubble mailer."
        multiline
        maxLength={SHIP_NOTES_MAX + 50}
        error={errors.notes}
        hint={`${value.notes.length} / ${SHIP_NOTES_MAX}`}
        editable={!busy}
        testID="ship-notes"
      />
      {!value.trackingNumber.trim() ? (
        <FormMessage tone="info" testID="ship-tip">
          Without tracking, a “never arrived” dispute is harder to settle in your favour.
        </FormMessage>
      ) : null}
    </FormDialog>
  );
}

const EMPTY_DISPUTE: DisputeFormValue = { reason: null, description: '' };

/**
 * "Open a dispute" (buyer, PAID or SHIPPED protected trades within the window; web:
 * `OpenDisputeDialogComponent`): the reason and a description. Explains that the payout goes on
 * hold and that photos and messages are added on the dispute screen. Confirms with the
 * `POST /trades/{id}/disputes` body.
 */
export function OpenDisputeDialog({
  visible,
  sellerName,
  cardName,
  windowEndsAt,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  sellerName: string;
  cardName: string;
  /** End of the dispute window, worded (`null` before the shipment). */
  windowEndsAt: string | null;
  busy: boolean;
  onConfirm: (request: OpenDisputeRequest) => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const [value, setValue] = useState<DisputeFormValue>(EMPTY_DISPUTE);
  const [touched, setTouched] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setValue(EMPTY_DISPUTE);
      setTouched(false);
    }
  }
  const errors = disputeFormErrors(value);
  const shown = touched ? errors : {};
  return (
    <FormDialog
      visible={visible}
      title="Open a dispute"
      message={`Something wrong with ${cardName}? Tell us what happened. The payout to ${sellerName} goes on hold and an OrenjiTrade admin reviews what you both share.${
        windowEndsAt ? ` You can open a dispute until ${windowEndsAt}.` : ''
      }`}
      confirmLabel="Open dispute"
      busy={busy}
      onConfirm={() => {
        setTouched(true);
        if (Object.keys(errors).length === 0) {
          onConfirm(toDisputeRequest(value));
        }
      }}
      onCancel={onCancel}
      testID="dispute-dialog"
    >
      <View style={styles.block}>
        <Text style={[textStyle('sm'), styles.legend, { color: palette.ink }]}>
          What went wrong?
        </Text>
        <RadioGroup<DisputeReason>
          label="What went wrong?"
          options={DISPUTE_REASONS.map((reason) => ({
            value: reason.value,
            label: reason.label,
            help: reason.hint,
          }))}
          value={(value.reason ?? '') as DisputeReason}
          onChange={(reason) => setValue((current) => ({ ...current, reason }))}
          disabled={busy}
          testID="dispute-reason"
        />
        {shown.reason ? (
          <Text
            accessibilityRole="alert"
            testID="dispute-reason-error"
            style={[textStyle('xs'), { color: palette.danger }]}
          >
            {shown.reason}
          </Text>
        ) : null}
      </View>
      <TextField
        label="Describe the problem"
        value={value.description}
        onChangeText={(description) => setValue((current) => ({ ...current, description }))}
        placeholder="What did you receive, and how does it differ from the listing?"
        multiline
        maxLength={DISPUTE_TEXT_MAX + 50}
        error={shown.description}
        hint={`${value.description.length} / ${DISPUTE_TEXT_MAX}`}
        editable={!busy}
        testID="dispute-description"
      />
      <FormMessage tone="info">
        Next, add photos or statements and talk with {sellerName} on the dispute screen.
      </FormMessage>
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing[1] },
  legend: { fontWeight: fontWeight.semibold },
});
