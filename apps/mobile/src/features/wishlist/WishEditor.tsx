import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError, type ApiError } from '@/src/api/ApiError';
import { useCard } from '@/src/api/hooks/catalog';
import { useCreateWish, usePriceTerms, useUpdateWish } from '@/src/api/hooks/wishlist';
import type { CardSuggestion, WishlistItemResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { CardPicker } from '@/src/features/inventory/CardPicker';
import { SeePremiumButton } from '@/src/features/limits/SeePremiumButton';
import { printingsWithCode } from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { WishFields } from './WishFields';
import {
  hasWishErrors,
  newWishDefaults,
  toCreateWishRequest,
  toUpdateWishRequest,
  validateWish,
  wishFormFromItem,
  wishSaveError,
  type WishFormErrors,
  type WishFormValue,
} from './wishForm';
import { addedMessage } from './wishlistLabels';

export type WishEditorProps =
  | {
      mode: 'create';
      cardId?: string | null;
      printingId?: string | null;
      rarity?: string | null;
    }
  | { mode: 'edit'; item: WishlistItemResponse };

/**
 * Add a wish (optionally for a known card, printing or rarity, e.g. from a card page) or edit one
 * (the web's wishlist dialog, stage S2): card autocomplete → public note, "Near Mint only", one
 * optional price term (`GET /wishlist/price-terms`) and which copy (any printing, any printing of
 * one rarity, or one printing). A printing code typed in the autocomplete preselects a printing
 * only when exactly one printing of the card has it; a code several printings share starts on
 * "Any printing" and "Which copy" lists those printings first (never a silent pick). Wishlist alerts come from collectors of the same region (ADR
 * 0017). Saves with `POST /wishlist` or `PATCH /wishlist/{id}`; the same selection twice (409)
 * and plan limits (429) are explained in place.
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
  const [wantedRarity, setWantedRarity] = useState<string | null>(
    props.mode === 'create' ? (props.rarity ?? null) : null
  );
  // A printing code typed in the autocomplete. A code is not a printing: several printings of
  // the card can share it (a 1st Edition and an Unlimited one, one code in several rarities).
  const [wantedCode, setWantedCode] = useState<string | null>(null);
  const [form, setForm] = useState<WishFormValue | null>(
    editItem ? wishFormFromItem(editItem) : null
  );
  const [errors, setErrors] = useState<WishFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  // A plan limit refused the save: offer Premium.
  const [limited, setLimited] = useState(false);
  const card = useCard(cardId);
  const terms = usePriceTerms();
  const create = useCreateWish();
  const update = useUpdateWish();
  const saving = create.isPending || update.isPending;
  const printings = card.data?.printings ?? [];

  // A new wish starts once the card is known (with the asked printing or rarity when the card
  // has it; else any printing). A typed code preselects a printing only when exactly one
  // printing of the card carries it: among several, none is picked for the collector.
  const cardData = card.data;
  const coded = printingsWithCode(printings, wantedCode);
  const sharedCode = coded.length > 1 ? wantedCode : null;
  if (!form && cardData && !editing) {
    const wanted = coded.length === 1 ? (coded[0]?.id ?? null) : wantedPrinting;
    const known = !!wanted && printings.some((printing) => printing.id === wanted);
    const rarity = printings.some((printing) => printing.rarity === wantedRarity)
      ? wantedRarity
      : null;
    setForm(newWishDefaults(known ? { printingId: wanted } : { rarity }));
  }

  const pick = (suggestion: CardSuggestion) => {
    if (!suggestion.id) {
      return;
    }
    setForm(null);
    setErrors({});
    setMessage(null);
    setCardId(suggestion.id);
    setWantedPrinting(null);
    setWantedCode(suggestion.kind === 'PRINTING' ? (suggestion.printingCode ?? null) : null);
    setWantedRarity(null);
  };

  const changeCard = () => {
    setCardId(null);
    setWantedPrinting(null);
    setWantedCode(null);
    setWantedRarity(null);
    setForm(null);
    setErrors({});
    setMessage(null);
  };

  const save = async () => {
    if (!form || !card.data?.id || saving) {
      return;
    }
    const found = validateWish(form);
    setErrors(found);
    if (hasWishErrors(found)) {
      setMessage('Check the highlighted fields.');
      return;
    }
    setMessage(null);
    setLimited(false);
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
        setLimited(error.errorCode === 'LIMIT_REACHED');
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    }
  };

  if (!cardId) {
    return (
      <View style={styles.root} testID="wish-card-step">
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          Which card are you looking for? We&apos;ll tell you when a collector of your region lists
          it.
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

      <WishFields
        value={form}
        onChange={(next) => {
          setForm(next);
          setMessage(null);
        }}
        errors={errors}
        printings={printings}
        sharedCode={sharedCode}
        terms={terms.data ?? []}
        termsError={!!terms.error}
        onRetryTerms={() => void terms.refetch()}
        disabled={saving}
      />

      {message ? <FormMessage testID="wish-error">{message}</FormMessage> : null}
      {limited ? <SeePremiumButton testID="wish-limit-premium" /> : null}
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
