import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyBinders } from '@/src/api/hooks/binders';
import { useCard } from '@/src/api/hooks/catalog';
import { useApplyPhotoChanges, useCreateInventoryItem } from '@/src/api/hooks/inventory';
import type { CardSuggestion, PrintingSummary } from '@/src/api/types';
import { BackBar } from '@/src/components/ui/BackBar';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { AddCardSearch } from '@/src/features/inventory/AddCardSearch';
import { AddCardsStart } from '@/src/features/inventory/AddCardsStart';
import { CardFormFields } from '@/src/features/inventory/CardFormFields';
import { CardHeader } from '@/src/features/inventory/CardHeader';
import type { PhotoTile } from '@/src/features/inventory/CardPhotos';
import {
  hasErrors,
  newCardForm,
  serverCardErrors,
  toCreateBody,
  validateCardForm,
  type CardFormErrors,
  type CardFormValue,
} from '@/src/features/inventory/cardForm';
import {
  ADD_CARDS_COPY,
  ADD_DETAILS_COPY,
  CARD_FORM_COPY,
  PRINTING_COPY,
  TOAST_COPY,
} from '@/src/features/inventory/inventoryCopy';
import { InventoryFormScreen } from '@/src/features/inventory/InventoryFormScreen';
import { useInventoryUiStore, type LocalPhoto } from '@/src/features/inventory/inventoryUiStore';
import { photoRefusal } from '@/src/features/inventory/itemPhotoRules';
import { PrintingPicker } from '@/src/features/inventory/PrintingPicker';
import { useCardFindability } from '@/src/features/inventory/useCardFindability';
import { isLimitReached, limitReachedInfo } from '@/src/lib/limits';
import { PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

type Step = 'start' | 'typing' | 'printing' | 'details';

type Params = { cardId?: string; printingId?: string; binderId?: string };

/**
 * Adding cards (owner spec 2026-10-14, section 6, mockup screens 3 to 6): Add cards (the search
 * first, the two imports, the camera "Coming later") → typing (cards and exact printings) →
 * Choose the printing → Add to inventory (copies, the asking price as typed, who can see it, the
 * binder, the public note and up to four photos). The card is created first, then its photos are
 * uploaded: a photo that fails keeps the card and opens Edit card with "Try again". Saving goes
 * back with "Saved · {card}" and "View". Opened from a binder (preselected) or a card page (card
 * and printing preselected) too.
 */
export default function AddCardsScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const snackbar = useSnackbar();
  const { palette } = useTheme();
  const [step, setStep] = useState<Step>(
    params.cardId ? (params.printingId ? 'details' : 'printing') : 'start'
  );
  const [text, setText] = useState('');
  const [cardId, setCardId] = useState<string | null>(params.cardId || null);
  const [printingId, setPrintingId] = useState<string | null>(params.printingId || null);
  // Where Back leads from the details: the printings, or the search for an exact printing.
  const [detailsFrom, setDetailsFrom] = useState<'printing' | 'typing' | 'link'>(
    params.printingId ? 'link' : 'printing'
  );
  const [form, setForm] = useState<CardFormValue>(() => newCardForm(params.binderId || null));
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<CardFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const card = useCard(cardId);
  const binders = useMyBinders();
  const create = useCreateInventoryItem();
  const applyPhotos = useApplyPhotoChanges();
  const markSaved = useInventoryUiStore((state) => state.markSaved);
  const keepFailedPhotos = useInventoryUiStore((state) => state.keepFailedPhotos);
  const printings = card.data?.printings ?? [];
  const printing: PrintingSummary | null =
    printings.find((candidate) => candidate.id === printingId) ??
    (printings.length === 1 ? (printings[0] ?? null) : null);
  const findability = useCardFindability();

  const leave = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/inventory');
    }
  }, [router]);

  const back = useCallback(() => {
    setMessage(null);
    if (step === 'details') {
      if (detailsFrom === 'link') {
        leave();
      } else if (detailsFrom === 'typing' || printings.length <= 1) {
        setStep(params.cardId ? 'printing' : 'typing');
      } else {
        setStep('printing');
      }
    } else if (step === 'printing') {
      if (params.cardId) {
        leave();
      } else {
        setStep('typing');
      }
    } else if (step === 'typing') {
      setStep('start');
    } else {
      leave();
    }
  }, [detailsFrom, leave, params.cardId, printings.length, step]);

  // Android's back key walks the steps back like the back arrow.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step === 'start') {
          return false;
        }
        back();
        return true;
      });
      return () => subscription.remove();
    }, [back, step])
  );

  const toDetails = (nextPrinting: string | null, from: 'printing' | 'typing') => {
    setPrintingId(nextPrinting);
    setDetailsFrom(from);
    setErrors({});
    setMessage(null);
    setStep('details');
  };

  const pickCard = (suggestion: CardSuggestion) => {
    if (!suggestion.id) {
      return;
    }
    setCardId(suggestion.id);
    setPrintingId(null);
    // One printing needs no choice.
    if (suggestion.printingCount === 1) {
      toDetails(null, 'typing');
    } else {
      setStep('printing');
    }
  };

  const pickPrinting = (suggestion: CardSuggestion) => {
    if (!suggestion.id || !suggestion.printingId) {
      return;
    }
    setCardId(suggestion.id);
    toDetails(suggestion.printingId, 'typing');
  };

  const tiles: PhotoTile[] = photos.map((photo) => ({
    kind: 'local',
    key: photo.key,
    photo,
    state: saving ? 'uploading' : 'waiting',
  }));

  const submit = async () => {
    if (!printing?.id || !card.data) {
      return;
    }
    const found = validateCardForm(form);
    setErrors(found);
    if (hasErrors(found)) {
      setMessage(CARD_FORM_COPY.checkFields);
      return;
    }
    setMessage(null);
    setSaving(true);
    let created;
    try {
      created = await create.mutateAsync(toCreateBody(form, printing.id));
    } catch (error) {
      const apiError = error as ApiError;
      setErrors(serverCardErrors(apiError));
      // A reached limit is a plain cap for everyone (free for all): no plan, no upgrade.
      setMessage(
        isLimitReached(apiError)
          ? CARD_FORM_COPY.inventoryFull(limitReachedInfo(apiError).limit)
          : friendlyMessage(apiError)
      );
      setSaving(false);
      return;
    }
    let failed: LocalPhoto[] = [];
    if (photos.length > 0) {
      try {
        const result = await applyPhotos.mutateAsync({ id: created.id, add: photos, remove: [] });
        // A photo the API refused says why on Edit card, where it can only be removed.
        failed = photos
          .filter((photo) => result.failed.includes(photo.key))
          .map((photo) => ({ ...photo, problem: photoRefusal(result.errors[photo.key]) }));
      } catch {
        failed = photos;
      }
    }
    setSaving(false);
    markSaved(created.id);
    const name = created.card.name;
    if (failed.length > 0) {
      // The card is kept; its Edit card opens on the photos that were not saved, with "Try
      // again", and the toast says it too (not a plain "Saved").
      keepFailedPhotos(created.id, failed);
      snackbar.show(name, { title: TOAST_COPY.savedPhotosFailed(failed.length) });
      router.replace({ pathname: '/items/[id]', params: { id: created.id } });
      return;
    }
    snackbar.show(name, {
      title: TOAST_COPY.saved,
      icon: 'success',
      action: {
        label: TOAST_COPY.view,
        onPress: () => router.push({ pathname: '/items/[id]', params: { id: created.id } }),
        testID: 'snackbar-view',
      },
    });
    leave();
  };

  let header;
  let body;
  let footer = null;
  if (step === 'start') {
    header = (
      <BackBar
        label={ADD_CARDS_COPY.back}
        variant="back"
        backLabel={ADD_CARDS_COPY.backLabel}
        onBack={leave}
        testID="add-cards-back"
      />
    );
    body = (
      <AddCardsStart
        onSearch={() => setStep('typing')}
        onImportDeck={() => router.push({ pathname: '/items/import', params: { source: 'YDK' } })}
        onImportCollectr={() =>
          router.push({ pathname: '/items/import', params: { source: 'COLLECTR_CSV' } })
        }
      />
    );
  } else if (step === 'typing') {
    header = null;
    body = (
      <AddCardSearch
        text={text}
        onText={setText}
        onCancel={() => setStep('start')}
        onCard={pickCard}
        onPrinting={pickPrinting}
      />
    );
  } else if (step === 'printing') {
    header = (
      <BackBar
        label={PRINTING_COPY.title}
        backLabel={PRINTING_COPY.backLabel}
        onBack={back}
        testID="printing-back"
      />
    );
    body = card.data ? (
      <PrintingPicker
        card={card.data}
        onPick={(picked) => toDetails(picked.id ?? null, 'printing')}
      />
    ) : card.error ? (
      <ErrorState
        testID="add-item-card-error"
        error={card.error}
        title={PRINTING_COPY.loadError}
        onRetry={() => void card.refetch()}
      />
    ) : (
      <SkeletonList rows={4} rowHeight={64} testID="add-item-card-loading" />
    );
  } else {
    header = (
      <BackBar
        label={ADD_DETAILS_COPY.title}
        backLabel={ADD_DETAILS_COPY.backLabel}
        onBack={back}
        testID="add-item-back"
      />
    );
    if (card.data && printing) {
      body = (
        <View style={styles.details}>
          <CardHeader
            name={card.data.name ?? ''}
            game={card.data.game}
            printing={printing}
            printings={printings}
            fallbackImage={card.data.primaryImageUrl}
            variant="add"
          />
          <CardFormFields
            value={form}
            onChange={(patch) => {
              setForm((current) => ({ ...current, ...patch }));
              setErrors((current) => {
                const next = { ...current };
                for (const key of Object.keys(patch)) {
                  if (key === 'quantity' || key === 'price' || key === 'publicNote') {
                    delete next[key];
                  }
                }
                return next;
              });
            }}
            errors={errors}
            binders={binders.data ?? []}
            findability={findability}
            disabled={saving}
            photos={{
              tiles,
              onAdd: (added) => setPhotos((current) => [...current, ...added].slice(0, 4)),
              onRemove: (key) => setPhotos((current) => current.filter((p) => p.key !== key)),
            }}
          />
          {message ? <FormMessage testID="add-item-error">{message}</FormMessage> : null}
        </View>
      );
      footer = (
        <>
          <PillButton
            label={ADD_DETAILS_COPY.submit}
            loadingLabel={ADD_DETAILS_COPY.submitting}
            icon="plus"
            loading={saving}
            onPress={() => void submit()}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="add-item-submit"
          />
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[textStyle('xs'), styles.footnote, { color: palette.textMuted }]}
          >
            {ADD_DETAILS_COPY.footnote}
          </Text>
        </>
      );
    } else if (card.error) {
      body = (
        <ErrorState
          testID="add-item-card-error"
          error={card.error}
          title={PRINTING_COPY.loadError}
          onRetry={() => void card.refetch()}
        />
      );
    } else if (card.data && !printing) {
      // The card's printings changed under a link: choose again.
      body = (
        <PrintingPicker
          card={card.data}
          onPick={(picked) => toDetails(picked.id ?? null, 'printing')}
        />
      );
    } else {
      body = <SkeletonList rows={4} rowHeight={72} testID="add-item-card-loading" />;
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: ADD_CARDS_COPY.title }} />
      <InventoryFormScreen
        // Each step opens at its top: a long list of printings scrolled down left Add to
        // inventory scrolled past its header.
        key={step}
        header={header}
        footer={footer}
        testID={step === 'details' ? 'screen-add-item' : `screen-add-cards-${step}`}
      >
        {body}
      </InventoryFormScreen>
    </>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing[4] },
  footnote: { textAlign: 'center' },
});
