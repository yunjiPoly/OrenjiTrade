import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isApiError, type ApiError } from '@/src/api/ApiError';
import { useCard } from '@/src/api/hooks/catalog';
import {
  useCreateWish,
  useDeleteWish,
  usePriceTerms,
  useUpdateWish,
} from '@/src/api/hooks/wishlist';
import type { CardDetail, PrintingSummary, WishlistItemResponse } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { gameTile } from '@/src/features/games/gameTiles';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { printingCode, printingsWithCode } from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import { PINNED_MAX_FONT_SCALE, fontWeight, useTheme } from '@/src/theme';

import { WISH_COPY as COPY } from './wishCopy';
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

/**
 * A printing code as the card search's text gave it ("lob en001" for `LOB-EN001`): upper case,
 * spaces as dashes. Only an exact code of the card picks a printing.
 */
export function codeOfTyped(text: string | null | undefined): string | null {
  const code = (text ?? '').trim().toUpperCase().replace(/\s+/g, '-');
  return code || null;
}

/** The line under the card: the wished printing ("EXFO-EN065 · Common"), else the count. */
export function wishCardLine(printing: PrintingSummary | null, printingCount: number): string {
  if (printing) {
    return [printingCode(printing), printing.rarity].filter(Boolean).join(' · ');
  }
  return COPY.printings(printingCount);
}

export type WishEditorProps =
  | {
      mode: 'create';
      cardId: string;
      printingId?: string | null;
      rarity?: string | null;
      /** The text typed in the card search that led here (a printing code picks its printing). */
      code?: string | null;
      /** Opened from "Add a wish"'s card search: Change goes back to it, a save past it. */
      fromSearch?: boolean;
    }
  | { mode: 'edit'; item: WishlistItemResponse };

/**
 * Add a wish and Edit a wish (mockup v50 screens 64 and 65, stage R14; stage S2's rules): the card
 * (its game, its name and "{n} printings in the catalog", or the wished printing) with "Change"
 * back to the card search, then which copy, "Near Mint only", the price you would pay as chips
 * ("No price" and the server's % TCG terms) and the public note (≤ 280), and "Add to wishlist" or
 * "Save changes" at the bottom; an edit adds a red "Remove from wishlist", asked in a sheet.
 *
 * A printing code typed in the card search preselects a printing only when exactly one printing of
 * the card has it; a code several printings share starts on "Any printing" and "Which copy" lists
 * those printings first (never a silent pick). Wishlist alerts come from collectors of the same
 * region (ADR 0017). Saves with `POST /wishlist` or `PATCH /wishlist/{id}`; the same selection
 * twice (409) and the usage limit (429, the same for every collector) are explained in place.
 */
export function WishEditor(props: WishEditorProps) {
  const router = useRouter();
  const editItem = props.mode === 'edit' ? props.item : null;
  const cardId = props.mode === 'edit' ? (props.item.card?.id ?? null) : props.cardId;
  const card = useCard(cardId);
  const title = editItem ? COPY.editTitle : COPY.addTitle;
  const fromSearch = props.mode === 'create' && props.fromSearch === true;

  // Back where the wish was opened from: Search › Wishlist (stage R5), its card search, a card page.
  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/search', params: { segment: 'wishlist' } });
    }
  };

  if (card.error && !card.data) {
    return (
      <SettingsPage title={title} onBack={back} testID={screenId(props)}>
        <ErrorState
          testID="wish-card-error"
          error={card.error}
          title={COPY.cardError}
          onRetry={() => void card.refetch()}
        />
      </SettingsPage>
    );
  }
  if (!card.data) {
    return (
      <SettingsPage title={title} onBack={back} testID={screenId(props)}>
        <SkeletonList rows={4} rowHeight={64} testID="wish-loading" />
      </SettingsPage>
    );
  }
  return (
    <WishForm
      {...props}
      key={card.data.id}
      card={card.data}
      title={title}
      fromSearch={fromSearch}
      onBack={back}
    />
  );
}

function screenId(props: WishEditorProps): string {
  return props.mode === 'edit' ? 'screen-wish-edit' : 'screen-wish-new';
}

function WishForm(
  props: WishEditorProps & {
    card: CardDetail;
    title: string;
    fromSearch: boolean;
    onBack: () => void;
  }
) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const { card, title, fromSearch, onBack } = props;
  const editItem = props.mode === 'edit' ? props.item : null;
  const printings = card.printings ?? [];
  // A printing code typed in the card search. A code is not a printing: several printings of the
  // card can share it (a 1st Edition and an Unlimited one, one code in several rarities).
  const wantedCode = props.mode === 'create' ? codeOfTyped(props.code) : null;
  const coded = printingsWithCode(printings, wantedCode);
  const sharedCode = coded.length > 1 ? wantedCode : null;
  const [form, setForm] = useState<WishFormValue>(() => {
    if (editItem) {
      return wishFormFromItem(editItem);
    }
    const asked = props.mode === 'create' ? (props.printingId ?? null) : null;
    const wanted = coded.length === 1 ? (coded[0]?.id ?? null) : asked;
    const known = !!wanted && printings.some((printing) => printing.id === wanted);
    const askedRarity = props.mode === 'create' ? (props.rarity ?? null) : null;
    const rarity = printings.some((printing) => printing.rarity === askedRarity)
      ? askedRarity
      : null;
    return newWishDefaults(known ? { printingId: wanted } : { rarity });
  });
  const [errors, setErrors] = useState<WishFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const terms = usePriceTerms();
  const create = useCreateWish();
  const update = useUpdateWish();
  const remove = useDeleteWish();
  const [removing, setRemoving] = useState(false);
  const saving = create.isPending || update.isPending;
  const name = card.name ?? 'Card';
  const wished = editItem?.printing
    ? (printings.find((printing) => printing.id === editItem.printing?.id) ??
      editItem.printing ??
      null)
    : null;

  // After a save or a removal: Search › Wishlist, past the card search that led here, on the
  // card's game (the wishlist shows the browsed game's wishes, stage G: the wish is in view).
  const done = () => {
    if (fromSearch) {
      router.dismissTo({
        pathname: '/search',
        params: card.game ? { segment: 'wishlist', game: card.game } : { segment: 'wishlist' },
      });
    } else {
      onBack();
    }
  };
  // "Change": back to the card search (it keeps what was typed), or to a new one.
  const change = () => {
    if (fromSearch && router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/wishlist/new', params: card.game ? { game: card.game } : {} });
    }
  };

  const confirmRemove = async () => {
    if (!editItem) {
      return;
    }
    try {
      await remove.mutateAsync({ id: editItem.id });
      setRemoving(false);
      snackbar.show(COPY.removed(editItem.card?.name ?? 'The card'));
      done();
    } catch (error) {
      setRemoving(false);
      setMessage(isApiError(error) ? wishSaveError(error as ApiError).message : COPY.tryLater);
    }
  };

  const save = async () => {
    if (!card.id || saving) {
      return;
    }
    const found = validateWish(form);
    setErrors(found);
    if (hasWishErrors(found)) {
      setMessage(COPY.checkFields);
      return;
    }
    setMessage(null);
    try {
      if (editItem) {
        await update.mutateAsync({ id: editItem.id, body: toUpdateWishRequest(form) });
        snackbar.show(COPY.updated);
      } else {
        const saved = await create.mutateAsync(toCreateWishRequest(form, card.id));
        snackbar.show(addedMessage(saved), { duration: 6000 });
      }
      done();
    } catch (error) {
      if (isApiError(error)) {
        const shown = wishSaveError(error as ApiError);
        setErrors(shown.fields);
        setMessage(shown.message);
      } else {
        setMessage(COPY.failed);
      }
    }
  };

  const tile = card.game ? gameTile(card.game) : null;
  const eyebrow =
    tile === null ? palette.primary : palette.scheme === 'dark' ? tile.foreground : tile.background;

  // A refusal is said in the bar, where the button was pressed.
  const footer = (
    <>
      {message ? <FormMessage testID="wish-error">{message}</FormMessage> : null}
      <PillButton
        label={editItem ? COPY.save : COPY.add}
        loading={saving}
        loadingLabel={COPY.saving}
        onPress={() => void save()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="wish-save"
      />
      {editItem ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving || remove.isPending}
          onPress={() => setRemoving(true)}
          testID="wish-remove"
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[styles.removeLabel, { color: palette.danger }]}
          >
            {COPY.remove}
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <SettingsPage title={title} onBack={onBack} footer={footer} testID={screenId(props)}>
      <View
        testID="wish-card"
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <CardImage src={card.primaryImageUrl} alt={name} game={card.game} size="sm" />
        <View style={styles.cardWords}>
          {card.game ? (
            <Text style={[styles.eyebrow, { color: eyebrow }]}>
              {gameLabel(card.game).toUpperCase()}
            </Text>
          ) : null}
          <Text style={[styles.cardName, { color: palette.ink }]}>{name}</Text>
          <Text style={[styles.cardLine, { color: palette.textMuted }]} testID="wish-card-line">
            {wishCardLine(wished, printings.length)}
          </Text>
        </View>
        {editItem ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COPY.changeLabel(name)}
            onPress={change}
            testID="wish-change-card"
            style={({ pressed }) => [styles.change, pressed && styles.pressed]}
          >
            <Text style={[styles.changeLabel, { color: palette.accent }]}>{COPY.change}</Text>
          </Pressable>
        )}
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

      {editItem ? (
        <ConfirmSheet
          visible={removing}
          title={COPY.removeTitle(editItem.card?.name ?? name)}
          message={COPY.removeBody}
          confirmLabel={COPY.removeConfirm}
          cancelLabel={COPY.keep}
          busy={remove.isPending}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(false)}
          testID="wish-remove-dialog"
        />
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardWords: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: fontWeight.bold, letterSpacing: 0.6 },
  cardName: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  cardLine: { fontSize: 12, lineHeight: 16 },
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: 4 },
  changeLabel: { fontSize: 13, fontWeight: fontWeight.semibold },
  remove: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  removeLabel: { fontSize: 14, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
