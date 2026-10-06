import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { newRequestId } from '@/src/api/client';
import { useCounterOffer, useCreateOffer } from '@/src/api/hooks/offers';
import type { OfferResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ChoiceChips } from '@/src/components/ui/ChoiceChips';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { formatMoney } from '@/src/lib/catalog';
import { CURRENCIES, availabilityLabel, conditionLabel } from '@/src/lib/inventory';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  counterValue,
  formKinds,
  newOfferValue,
  parseAmount,
  sameDeal,
  toCounterRequest,
  toCreateRequest,
  tradeLineFromOffer,
  validateOffer,
  type OfferFormErrors,
  type OfferFormValue,
  type TradeLine,
} from './offerForm';
import {
  OFFER_EXPIRY_OPTIONS,
  OFFER_KIND_INFO,
  OFFER_MESSAGE_MAX,
  kindHasCards,
  kindHasCash,
  offerTermsText,
  type OfferKind,
  type OfferRole,
} from './offerLabels';
import { offerProblem, type OfferProblem } from './offerProblems';
import type { OfferTarget } from './offerTarget';
import { TradeCardPicker } from './TradeCardPicker';

/** The typed amount for the summary (nothing while it is empty or invalid). */
function amountOrNull(text: string): number | null {
  const amount = parseAmount(text);
  return amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null;
}

export interface CounterContext {
  /** The live proposal being answered. */
  offer: OfferResponse;
  viewerRole: OfferRole;
  otherName: string;
}

export interface OfferEditorProps {
  target: OfferTarget;
  counter?: CounterContext | null;
  /** The new offer (or counter-offer) was created. */
  onSent: (offer: OfferResponse) => void;
  /** A counter-offer was refused because the negotiation changed: re-read it. */
  onStale?: (problem: OfferProblem) => void;
}

/**
 * The "Make an offer" / "Counter-offer" form (web: `MakeOfferDialogComponent`): the card and its
 * seller (place label only), the kinds the card's availability allows (cash / trade / cash +
 * cards), the amount and currency, the caller's cards with copies (a seller's counter-offer can
 * only keep or drop the buyer's cards), a note, the expiry and a summary. A new offer is sent
 * with an `Idempotency-Key` fixed for the form; refusals (422 OFFERS_NOT_ACCEPTED, 409
 * OFFER_ALREADY_OPEN with a link to that offer, 404, 400 fields, 429 plan limits) are explained
 * in place; a counter-offer refused because the offer changed hands the problem back.
 */
export function OfferEditor({ target, counter = null, onSent, onStale }: OfferEditorProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const create = useCreateOffer();
  const counterMutation = useCounterOffer();
  const [idempotencyKey] = useState(() => newRequestId());

  const pool = useMemo<TradeLine[]>(
    () =>
      (counter?.offer.tradeItems ?? [])
        .map((line) => tradeLineFromOffer(line))
        .filter((line): line is TradeLine => line !== null),
    [counter]
  );
  const pickerMode = counter?.viewerRole === 'SELLER' ? 'proposal' : 'inventory';
  const kinds = useMemo(
    () =>
      formKinds(target, counter ? { viewerRole: counter.viewerRole, poolSize: pool.length } : null),
    [counter, pool.length, target]
  );
  const currencies = CURRENCIES.includes(target.currency)
    ? CURRENCIES
    : [target.currency, ...CURRENCIES];

  const [value, setValue] = useState<OfferFormValue>(() => {
    if (!counter) {
      return newOfferValue(kinds, target.currency);
    }
    const initial = counterValue(counter.offer, target.currency);
    return kinds.includes(initial.kind) ? initial : { ...initial, kind: kinds[0] ?? 'CASH' };
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<OfferFormErrors>({});
  const [problem, setProblem] = useState<OfferProblem | null>(null);

  const busy = create.isPending || counterMutation.isPending;
  const errors = { ...validateOffer(value), ...serverErrors };
  const shown = (field: keyof OfferFormErrors) =>
    serverErrors[field] ?? (submitted ? errors[field] : undefined) ?? null;
  const blocked = !!problem?.openOfferId;

  const update = (changes: Partial<OfferFormValue>) => {
    setValue((current) => ({ ...current, ...changes }));
    setServerErrors({});
    if (problem && !problem.openOfferId) {
      setProblem(null);
    }
  };

  const askingPrice = formatMoney(target.askingPrice, target.currency);
  const terms = offerTermsText({
    kind: value.kind,
    cashAmount: amountOrNull(value.cashAmount),
    currency: value.currency,
    cards: value.cards,
  });
  const currentTerms = counter
    ? offerTermsText({
        kind: counter.offer.kind,
        cashAmount: counter.offer.cashAmount,
        currency: counter.offer.currency,
        cards: counter.offer.tradeItems,
      })
    : '';
  const singleKindHint =
    pickerMode === 'proposal' && kinds.length === 1
      ? 'the buyer offered no cards'
      : kinds[0] === 'CASH'
        ? 'this card is for sale'
        : 'this card is for trade';
  const otherName = counter ? counter.otherName : target.seller.displayName;

  const submit = async () => {
    if (busy || kinds.length === 0 || blocked) {
      return;
    }
    setSubmitted(true);
    if (Object.keys(validateOffer(value)).length > 0) {
      return;
    }
    if (counter && sameDeal(value, counter.offer)) {
      const field = value.kind === 'TRADE' ? 'cards' : 'cashAmount';
      const message = 'A counter-offer must change the amount or the cards.';
      setServerErrors({ [field]: message });
      setProblem({
        code: 'SAME_DEAL',
        message,
        openOfferId: null,
        latestOfferId: null,
        reload: false,
        fields: { [field]: message },
      });
      return;
    }
    setProblem(null);
    try {
      const offer = counter
        ? await counterMutation.mutateAsync({
            id: counter.offer.id,
            body: toCounterRequest(value, counter.offer.version),
          })
        : await create.mutateAsync({
            body: toCreateRequest(target.itemId, value),
            idempotencyKey,
          });
      onSent(offer);
    } catch (error) {
      if (!isApiError(error)) {
        setProblem({
          code: 'UNKNOWN',
          message: 'The offer could not be sent. Please try again.',
          openOfferId: null,
          latestOfferId: null,
          reload: false,
          fields: {},
        });
        return;
      }
      const refusal = offerProblem(error, otherName);
      if (counter && refusal.reload && onStale) {
        onStale(refusal);
        return;
      }
      setServerErrors(refusal.fields);
      setProblem(refusal);
    }
  };

  return (
    <View style={styles.root} testID="offer-form">
      <View
        style={[styles.target, { backgroundColor: palette.surface, borderColor: palette.border }]}
        accessibilityLabel="The card"
      >
        <CardImage src={target.imageUrl} alt={target.cardName} game={target.game} size="sm" />
        <View style={styles.grow}>
          <Text
            testID="offer-target-name"
            style={[textStyle('md'), styles.strong, { color: palette.ink }]}
          >
            {target.cardName}
          </Text>
          {target.printingCode || target.setName ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {target.printingCode ? <Text style={styles.mono}>{target.printingCode}</Text> : null}
              {target.setName ? ` · ${target.setName}` : ''}
            </Text>
          ) : null}
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {conditionLabel(target.condition)} · {availabilityLabel(target.availability)}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.ink }]}>
            {askingPrice ? `Asking ${askingPrice}` : 'No asking price'}
          </Text>
          <View style={styles.seller}>
            <Avatar src={target.seller.avatarUrl} name={target.seller.displayName} size={20} />
            <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
              {target.seller.displayName}
              {target.seller.placeLabel ? ` · ${target.seller.placeLabel}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {counter ? (
        <FormMessage tone="info" testID="current-proposal">
          Current proposal: {currentTerms}. Change the amount or the cards to answer{' '}
          {counter.otherName}.
        </FormMessage>
      ) : null}

      {kinds.length === 0 ? (
        <FormMessage testID="offer-not-accepted">
          This card does not accept offers right now.
        </FormMessage>
      ) : (
        <>
          {kinds.length > 1 ? (
            <ChoiceChips
              label="What do you offer?"
              options={kinds.map((kind) => ({ value: kind, label: OFFER_KIND_INFO[kind].label }))}
              value={value.kind}
              onChange={(kind: OfferKind) => update({ kind })}
              disabled={busy}
              hint={OFFER_KIND_INFO[value.kind].hint}
              testID="offer-kind"
            />
          ) : (
            <View style={styles.single} testID="offer-kind-single">
              <MaterialCommunityIcons
                name={OFFER_KIND_INFO[kinds[0] ?? 'CASH'].icon}
                size={18}
                color={palette.ink}
              />
              <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
                {OFFER_KIND_INFO[kinds[0] ?? 'CASH'].label} ·{' '}
                <Text style={{ color: palette.textMuted }}>{singleKindHint}</Text>
              </Text>
            </View>
          )}

          {kindHasCash(value.kind) ? (
            <View style={styles.cash}>
              <TextField
                label="Amount"
                value={value.cashAmount}
                onChangeText={(cashAmount) => update({ cashAmount })}
                keyboardType="decimal-pad"
                inputMode="decimal"
                editable={!busy}
                error={shown('cashAmount')}
                hint={
                  askingPrice
                    ? `The asking price is ${askingPrice}.`
                    : 'No asking price: offer what the card is worth to you.'
                }
                containerStyle={styles.grow}
                testID="offer-amount"
              />
              <View style={styles.currency}>
                <SelectSheet
                  label="Currency"
                  options={currencies.map((code) => ({ value: code, label: code }))}
                  value={value.currency}
                  onChange={(currency) => update({ currency })}
                  disabled={busy}
                  testID="offer-currency"
                />
              </View>
            </View>
          ) : null}
          {kindHasCash(value.kind) && counter?.offer.protectionRequested ? (
            <FormMessage tone="info" testID="protection-kept">
              Payment protection stays on for this deal.
            </FormMessage>
          ) : null}

          {kindHasCards(value.kind) ? (
            <View style={styles.block}>
              <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
                {counter?.viewerRole === 'SELLER' ? 'Their cards in the deal' : 'Your cards'}
              </Text>
              <TradeCardPicker
                lines={value.cards}
                mode={pickerMode}
                pool={pool}
                disabled={busy}
                onChange={(cards) => update({ cards })}
              />
              {shown('cards') ? (
                <Text
                  accessibilityRole="alert"
                  testID="cards-error"
                  style={[textStyle('xs'), { color: palette.danger }]}
                >
                  {shown('cards')}
                </Text>
              ) : null}
            </View>
          ) : null}

          <TextField
            label={`Note to ${otherName} (optional)`}
            value={value.message}
            onChangeText={(message) => update({ message })}
            placeholder="Where could you meet? Anything about the condition?"
            multiline
            maxLength={OFFER_MESSAGE_MAX + 50}
            editable={!busy}
            error={shown('message')}
            hint={`${value.message.length} / ${OFFER_MESSAGE_MAX}`}
            testID="offer-message"
          />

          <ChoiceChips
            label="Offer expires in"
            options={OFFER_EXPIRY_OPTIONS.map((option) => ({
              value: String(option.hours),
              label: option.label,
            }))}
            value={String(value.expiresInHours)}
            onChange={(hours: string) => update({ expiresInHours: Number(hours) })}
            disabled={busy}
            error={shown('expiresInHours')}
            testID="offer-expiry"
          />

          <View
            style={[styles.summary, { backgroundColor: palette.surfaceVariant }]}
            accessibilityLiveRegion="polite"
            testID="offer-summary"
          >
            <MaterialCommunityIcons
              name={OFFER_KIND_INFO[value.kind].icon}
              size={18}
              color={palette.ink}
            />
            <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
              You offer <Text style={styles.strong}>{terms}</Text> for {target.cardName}
              {counter?.offer.protectionRequested && kindHasCash(value.kind)
                ? ' with payment protection'
                : ''}
              .
            </Text>
          </View>
        </>
      )}

      {problem ? (
        <View style={styles.block}>
          <FormMessage testID="offer-error">{problem.message}</FormMessage>
          {problem.openOfferId ? (
            <Button
              label="View your open offer"
              variant="secondary"
              icon="tag-outline"
              onPress={() =>
                router.replace({
                  pathname: '/offers/[id]',
                  params: { id: problem.openOfferId as string },
                })
              }
              testID="offer-error-open"
            />
          ) : null}
        </View>
      ) : null}

      <Button
        label={counter ? 'Send counter-offer' : 'Send offer'}
        loading={busy}
        loadingLabel="Sending…"
        disabled={kinds.length === 0 || blocked}
        onPress={() => void submit()}
        testID="offer-submit"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  target: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  label: { fontWeight: fontWeight.medium },
  mono: { fontFamily: fontFamily.mono },
  seller: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] },
  single: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cash: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  currency: { width: 120, paddingTop: 22 },
  block: { gap: spacing[2] },
  summary: {
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
  },
});
