import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError, type ApiError } from '@/src/api/ApiError';
import { useCard } from '@/src/api/hooks/catalog';
import { useMyPlan } from '@/src/api/hooks/discovery';
import { useGames } from '@/src/api/hooks/profile';
import { useCreateWish, useUpdateWish } from '@/src/api/hooks/wishlist';
import type { CardSuggestion, WishlistItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { CardPicker } from '@/src/features/inventory/CardPicker';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { WishCriteriaFields } from './WishCriteriaFields';
import {
  clampRadius,
  hasWishErrors,
  newWishDefaults,
  radiusMaxFor,
  toCreateWishRequest,
  toUpdateWishRequest,
  validateWish,
  wishFormFromItem,
  wishRadiusCap,
  wishSaveError,
  type WishFormErrors,
  type WishFormValue,
} from './wishForm';
import { addedMessage } from './wishlistLabels';

export type WishEditorProps =
  | { mode: 'create'; cardId?: string | null; printingId?: string | null }
  | { mode: 'edit'; item: WishlistItemResponse };

/**
 * Add a wish (optionally for a known card or printing, e.g. from a card page) or edit one (the
 * web's wishlist dialog): card autocomplete → criteria (printing or any, condition minimum,
 * edition, language, rarity from the game's schema, maximum price and currency, radius bounded
 * by the plan's `map.radius.max_km`, trade preference, notes, alerts). Saves with
 * `POST /wishlist` or `PATCH /wishlist/{id}`; an identical wish (409) and plan limits (429) are
 * explained in place.
 */
export function WishEditor(props: WishEditorProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const editing = props.mode === 'edit';
  const editItem = props.mode === 'edit' ? props.item : null;
  const [cardId, setCardId] = useState<string | null>(
    props.mode === 'edit' ? (props.item.card?.id ?? null) : (props.cardId ?? null)
  );
  const [wantedPrinting, setWantedPrinting] = useState<string | null>(
    props.mode === 'create' ? (props.printingId ?? null) : null
  );
  const [form, setForm] = useState<WishFormValue | null>(
    editItem ? wishFormFromItem(editItem) : null
  );
  const [errors, setErrors] = useState<WishFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const card = useCard(cardId);
  const games = useGames();
  const plan = useMyPlan();
  const create = useCreateWish();
  const update = useUpdateWish();
  const saving = create.isPending || update.isPending;
  const cap = wishRadiusCap(plan.data);
  const radiusMax = radiusMaxFor(cap);
  const printings = card.data?.printings ?? [];
  const schema = games.data?.find((game) => game.slug === card.data?.game)?.schema ?? null;

  // A new wish starts once the card is known (with the asked printing when it is one of it).
  const cardData = card.data;
  if (!form && cardData && !editing) {
    const known = (cardData.printings ?? []).some((printing) => printing.id === wantedPrinting);
    setForm(newWishDefaults(known ? wantedPrinting : null, radiusMax));
  }
  // The plan answered: keep the radius within its cap.
  if (form && cap !== undefined && form.radiusKm > radiusMax) {
    setForm({ ...form, radiusKm: clampRadius(form.radiusKm, radiusMax) });
  }

  const pick = (suggestion: CardSuggestion) => {
    if (!suggestion.id) {
      return;
    }
    setForm(null);
    setErrors({});
    setMessage(null);
    setCardId(suggestion.id);
    setWantedPrinting(suggestion.kind === 'PRINTING' ? (suggestion.printingId ?? null) : null);
  };

  const changeCard = () => {
    setCardId(null);
    setWantedPrinting(null);
    setForm(null);
    setErrors({});
    setMessage(null);
  };

  const save = async () => {
    if (!form || !card.data?.id || saving) {
      return;
    }
    const found = validateWish(form, radiusMax);
    setErrors(found);
    if (hasWishErrors(found)) {
      setMessage('Check the highlighted fields.');
      return;
    }
    setMessage(null);
    try {
      if (editItem) {
        await update.mutateAsync({ id: editItem.id, body: toUpdateWishRequest(form) });
        snackbar.show('Wish updated.');
      } else {
        const saved = await create.mutateAsync(toCreateWishRequest(form, card.data.id));
        snackbar.show(addedMessage(saved), { duration: 6000 });
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/wishlist');
      }
    } catch (error) {
      if (isApiError(error)) {
        const shown = wishSaveError(error as ApiError);
        setErrors(shown.fields);
        setMessage(shown.message);
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    }
  };

  if (!cardId) {
    return (
      <View style={styles.root} testID="wish-card-step">
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          Which card are you looking for? We&apos;ll tell you when a collector nearby lists it.
        </Text>
        <CardPicker onPick={pick} />
      </View>
    );
  }

  if (card.error && !card.data) {
    return (
      <ErrorState
        testID="wish-card-error"
        error={card.error}
        title="This card could not load"
        onRetry={() => void card.refetch()}
      />
    );
  }

  if (!card.data || !form) {
    return <SkeletonList rows={4} rowHeight={64} testID="wish-loading" />;
  }

  const name = card.data.name ?? 'Card';
  return (
    <View style={styles.root}>
      <View
        testID="wish-card"
        style={[
          styles.card,
          { backgroundColor: palette.surfaceVariant, borderColor: palette.border },
        ]}
      >
        <CardImage src={card.data.primaryImageUrl} alt={name} game={card.data.game} size="sm" />
        <View style={styles.grow}>
          {card.data.game ? (
            <Text style={[textStyle('xs'), styles.strong, { color: palette.primary }]}>
              {gameLabel(card.data.game)}
            </Text>
          ) : null}
          <Text style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}>
            {name}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {printings.length} {printings.length === 1 ? 'printing' : 'printings'} in the catalog
          </Text>
          {!editing ? (
            <Button
              label="Change card"
              icon="swap-horizontal"
              variant="ghost"
              onPress={changeCard}
              testID="wish-change-card"
              style={styles.change}
            />
          ) : null}
        </View>
      </View>

      <WishCriteriaFields
        value={form}
        onChange={(next) => {
          setForm(next);
          setMessage(null);
        }}
        errors={errors}
        schema={schema}
        printings={printings}
        radiusMax={radiusMax}
        radiusCap={cap}
        disabled={saving}
      />

      {message ? <FormMessage testID="wish-error">{message}</FormMessage> : null}
      <Button
        label={editing ? 'Save changes' : 'Add to wishlist'}
        icon={editing ? 'content-save-outline' : 'heart-plus-outline'}
        onPress={() => void save()}
        loading={saving}
        loadingLabel="Saving…"
        testID="wish-save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  grow: { flex: 1, gap: 2, alignItems: 'flex-start' },
  strong: { fontWeight: fontWeight.semibold },
  change: { marginLeft: -spacing[3] },
});
