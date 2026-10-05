import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useMyBinders } from '@/src/api/hooks/binders';
import { useCard } from '@/src/api/hooks/catalog';
import { useCreateInventoryItem } from '@/src/api/hooks/inventory';
import { useGames } from '@/src/api/hooks/profile';
import { friendlyMessage } from '@/src/api/errorMessages';
import type { ApiError } from '@/src/api/ApiError';
import type { CardDetail, CardSuggestion, PrintingSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { PrintingList } from '@/src/features/catalog/PrintingList';
import { CardPicker } from '@/src/features/inventory/CardPicker';
import { ItemDetailsFields } from '@/src/features/inventory/ItemDetailsFields';
import {
  hasErrors,
  newItemDefaults,
  serverItemErrors,
  toCreateRequest,
  validateItemForm,
  type ItemFormErrors,
  type ItemFormValue,
} from '@/src/features/inventory/itemForm';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { StepIndicator } from '@/src/features/onboarding/StepIndicator';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { isLimitReached } from '@/src/lib/limits';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

type Step = 'search' | 'printing' | 'details';

const STEPS: readonly Step[] = ['search', 'printing', 'details'];
const STEP_LABELS = ['Find the card', 'Choose the printing', 'Add details'];

type Params = { cardId?: string; printingId?: string; binderId?: string };

/**
 * "Add a card" (web: the inventory's add dialog): catalog autocomplete → printing → details →
 * `POST /inventory/items`. Opened from the Inventory tab, a binder (preselected) or a card detail
 * (card and printing preselected). Cards start private unless the collector chooses otherwise.
 */
export default function AddItemScreen() {
  const params = useLocalSearchParams<Params>();
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const [step, setStep] = useState<Step>(params.cardId ? 'printing' : 'search');
  const [cardId, setCardId] = useState<string | null>(params.cardId || null);
  const [printingId, setPrintingId] = useState<string | null>(params.printingId || null);
  const [form, setForm] = useState<ItemFormValue | null>(null);
  const [formPrinting, setFormPrinting] = useState<string | null>(null);
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const card = useCard(cardId);
  const games = useGames();
  const binders = useMyBinders();
  const create = useCreateInventoryItem();
  const printings = card.data?.printings ?? [];
  // A card with a single printing (or a printing suggestion) needs no choice.
  const selected =
    printings.find((printing) => printing.id === printingId) ??
    (printings.length === 1 ? (printings[0] ?? null) : null);
  const schema = games.data?.find((game) => game.slug === card.data?.game)?.schema ?? null;

  const pick = (suggestion: CardSuggestion) => {
    if (!suggestion.id) {
      return;
    }
    if (suggestion.id !== cardId) {
      setForm(null);
    }
    setCardId(suggestion.id);
    setPrintingId(suggestion.kind === 'PRINTING' ? (suggestion.printingId ?? null) : null);
    setStep('printing');
  };

  const toDetails = () => {
    if (!selected?.id) {
      return;
    }
    // Keep what was typed when coming back from the printing step without changing it.
    if (!form || formPrinting !== selected.id) {
      setForm(newItemDefaults(selected, schema, params.binderId || null));
      setFormPrinting(selected.id);
    }
    setErrors({});
    setMessage(null);
    setFailure(null);
    setStep('details');
  };

  const back = () => {
    setMessage(null);
    setFailure(null);
    setStep(step === 'details' ? 'printing' : 'search');
  };

  const submit = async () => {
    if (!form || !selected?.id) {
      return;
    }
    const found = validateItemForm(form);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) {
      setMessage('Check the highlighted fields.');
      return;
    }
    setMessage(null);
    try {
      const item = await create.mutateAsync(toCreateRequest(form, selected.id));
      snackbar.show(`${item.card.name} added to your inventory.`);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/inventory');
      }
    } catch (error) {
      const apiError = error as ApiError;
      setErrors(serverItemErrors(apiError));
      setFailure(apiError);
      setMessage(isLimitReached(apiError) ? null : friendlyMessage(apiError));
    }
  };

  const index = STEPS.indexOf(step);

  return (
    <Screen scroll safeBottom testID="screen-add-item">
      <StepIndicator steps={STEP_LABELS} current={index} />
      {step === 'search' ? <CardPicker onPick={pick} /> : null}

      {step === 'printing' ? (
        <View style={styles.root}>
          {card.data ? (
            <>
              <CardHeader card={card.data} printing={selected} />
              <Text
                style={[textStyle('sm'), { color: palette.textMuted }]}
                testID="add-item-printing-count"
              >
                {printings.length} {printings.length === 1 ? 'printing' : 'printings'}. Pick the one
                you own.
              </Text>
              <PrintingList
                printings={printings}
                cardName={card.data.name ?? ''}
                game={card.data.game}
                selectedId={selected?.id ?? null}
                onSelect={(printing) => setPrintingId(printing.id ?? null)}
                label="Printing"
              />
            </>
          ) : card.error ? (
            <ErrorState
              testID="add-item-card-error"
              error={card.error}
              title="This card could not load"
              onRetry={() => void card.refetch()}
            />
          ) : (
            <SkeletonList rows={3} rowHeight={72} />
          )}
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              icon="arrow-left"
              onPress={back}
              testID="add-item-back"
            />
            <Button
              label="Continue"
              onPress={toDetails}
              disabled={!selected}
              style={styles.grow}
              testID="add-item-continue"
            />
          </View>
        </View>
      ) : null}

      {step === 'details' && form && card.data ? (
        <View style={styles.root}>
          <CardHeader card={card.data} printing={selected} compact />
          <ItemDetailsFields
            value={form}
            onChange={(patch) => {
              setForm((current) => (current ? { ...current, ...patch } : current));
              setErrors((current) => {
                const next = { ...current };
                for (const key of Object.keys(patch)) {
                  delete next[key as keyof ItemFormErrors];
                }
                return next;
              });
            }}
            errors={errors}
            schema={schema}
            binders={binders.data ?? []}
            disabled={create.isPending}
          />
          {failure && isLimitReached(failure) ? <LimitReachedNotice error={failure} /> : null}
          {message ? <FormMessage testID="add-item-error">{message}</FormMessage> : null}
          <View style={styles.actions}>
            <Button
              label="Back"
              variant="ghost"
              icon="arrow-left"
              onPress={back}
              testID="add-item-back"
            />
            <Button
              label="Add to inventory"
              loadingLabel="Adding…"
              icon="plus"
              loading={create.isPending}
              onPress={() => void submit()}
              style={styles.grow}
              testID="add-item-submit"
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function CardHeader({
  card,
  printing,
  compact = false,
}: {
  card: CardDetail;
  printing: PrintingSummary | null;
  compact?: boolean;
}) {
  const { palette } = useTheme();
  const image = printingImageUrl(printing) ?? card.primaryImageUrl ?? null;
  return (
    <View style={styles.header} testID="add-item-card">
      <CardImage src={image} alt={card.name ?? ''} game={card.game} size={compact ? 'xs' : 'sm'} />
      <View style={styles.grow}>
        {card.game ? (
          <Text style={[textStyle('xs'), styles.eyebrow, { color: palette.textMuted }]}>
            {gameLabel(card.game)}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          style={[textStyle('lg', 'heading'), styles.name, { color: palette.ink }]}
        >
          {card.name}
        </Text>
        {compact && printing ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {printingCode(printing)} · {printing.setName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  grow: { flex: 1 },
  eyebrow: { fontWeight: fontWeight.semibold, textTransform: 'uppercase' },
  name: { fontWeight: fontWeight.semibold },
  actions: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
});
