import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyBinders } from '@/src/api/hooks/binders';
import { useCard } from '@/src/api/hooks/catalog';
import {
  useApplyPhotoChanges,
  useConfirmInventoryItem,
  useDeleteInventoryItem,
  useInventoryItem,
  useUpdateInventoryItem,
} from '@/src/api/hooks/inventory';
import { useUid } from '@/src/api/hooks/useUid';
import type { InventoryItemResponse } from '@/src/api/types';
import { BackBar } from '@/src/components/ui/BackBar';
import { Button } from '@/src/components/ui/Button';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { CardFormFields } from '@/src/features/inventory/CardFormFields';
import { CardHeader } from '@/src/features/inventory/CardHeader';
import type { PhotoTile } from '@/src/features/inventory/CardPhotos';
import {
  cardFormOf,
  formChanged,
  hasErrors,
  serverCardErrors,
  toPatch,
  validateCardForm,
  type CardFormErrors,
  type CardFormValue,
} from '@/src/features/inventory/cardForm';
import { showCardDeleted } from '@/src/features/inventory/deleteToasts';
import { CARD_FORM_COPY, EDIT_CARD_COPY, TOAST_COPY } from '@/src/features/inventory/inventoryCopy';
import { InventoryFormScreen } from '@/src/features/inventory/InventoryFormScreen';
import { useInventoryUiStore, type LocalPhoto } from '@/src/features/inventory/inventoryUiStore';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { ITEM_PHOTO_MAX_COUNT, photoRefusal } from '@/src/features/inventory/itemPhotoRules';
import { useCardFindability } from '@/src/features/inventory/useCardFindability';
import { needsConfirmation } from '@/src/lib/inventory';
import { isLimitReached, limitReachedInfo } from '@/src/lib/limits';
import {
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

/**
 * Edit card (owner spec 2026-10-14, section 6, mockup screen 7): the fields of Add to inventory,
 * filled in; "Save changes", disabled and reading "No changes yet" until something changes (a
 * save also confirms the card is still available); the photos, saved with the button; and "Delete
 * this card", asked in a sheet, then undone from Inventory's toast within 10 minutes. A stale or
 * hidden card keeps "Still available" (the freshness rules). Photos that were not saved (here, or
 * when the card was added: the screen then opens on them) keep "Try again", and leaving asks
 * first; a photo the API refused says why and can only be removed.
 */
export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useInventoryItem(id);
  const router = useRouter();
  const leave = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/inventory');
    }
  };

  const header = (
    <BackBar
      label={EDIT_CARD_COPY.title}
      backLabel={EDIT_CARD_COPY.backLabel}
      onBack={leave}
      testID="edit-item-back"
    />
  );

  let content;
  if (item.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, title: EDIT_CARD_COPY.title }} />
        <CardEditor key={item.data.id} item={item.data} header={header} onLeave={leave} />
      </>
    );
  } else if (item.error?.status === 404 || item.error?.errorCode === 'VALIDATION_FAILED') {
    content = (
      <EmptyState
        testID="edit-item-not-found"
        icon="cards-outline"
        title={EDIT_CARD_COPY.notFoundTitle}
        description={EDIT_CARD_COPY.notFoundBody}
        actionLabel={EDIT_CARD_COPY.notFoundAction}
        onAction={() => router.navigate('/inventory')}
      />
    );
  } else if (item.error) {
    content = (
      <ErrorState
        testID="edit-item-error"
        error={item.error}
        title={EDIT_CARD_COPY.loadError}
        onRetry={() => void item.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={5} rowHeight={72} testID="edit-item-loading" />;
  }
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: EDIT_CARD_COPY.title }} />
      <InventoryFormScreen header={header} testID="screen-edit-item">
        {content}
      </InventoryFormScreen>
    </>
  );
}

interface LocalTile {
  photo: LocalPhoto;
  state: 'waiting' | 'uploading' | 'failed';
}

function CardEditor({
  item,
  header,
  onLeave,
}: {
  item: InventoryItemResponse;
  header: React.ReactNode;
  onLeave: () => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const uid = useUid();
  const binders = useMyBinders();
  // The card's printings, to name the edition, language or finish of a code several share.
  const card = useCard(item.card.id);
  const update = useUpdateInventoryItem();
  const confirm = useConfirmInventoryItem();
  const remove = useDeleteInventoryItem();
  const applyPhotos = useApplyPhotoChanges();
  const markSaved = useInventoryUiStore((state) => state.markSaved);
  const takeFailedPhotos = useInventoryUiStore((state) => state.takeFailedPhotos);
  const [form, setForm] = useState<CardFormValue>(() => cardFormOf(item));
  const [errors, setErrors] = useState<CardFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  // Photos picked here (or not saved when the card was added), and the saved ones taken away.
  const [initialFailed] = useState(
    () => useInventoryUiStore.getState().failedPhotos[item.id] ?? []
  );
  const [picked, setPicked] = useState<LocalTile[]>(() =>
    initialFailed.map((photo) => ({ photo, state: 'failed' as const }))
  );
  // Opened on photos the add could not save: say it to a screen reader too (the screen opens on
  // them, at the end of the form).
  useEffect(() => {
    const count = initialFailed.filter((photo) => !photo.problem).length;
    if (count > 0) {
      AccessibilityInfo.announceForAccessibility?.(CARD_FORM_COPY.photoFailed(count));
    }
  }, [initialFailed]);
  // Taken over: the store forgets them once this screen holds them.
  useEffect(() => {
    takeFailedPhotos(item.id);
  }, [item.id, takeFailedPhotos]);
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  // Deleted: leaving no longer asks about the photos that were not saved.
  const [gone, setGone] = useState(false);

  const findability = useCardFindability();
  const savedPhotos = item.images.filter((image) => !removed.includes(image.id));
  // A photo taken away and already deleted on the server no longer counts as a change.
  const toRemove = removed.filter((id) => item.images.some((image) => image.id === id));
  const pending = picked.filter((tile) => tile.state !== 'failed');
  // Not saved, and "Try again" may still save them: leaving would lose them.
  const unsaved = picked.filter((tile) => tile.state === 'failed' && !tile.photo.problem);
  const guard = useLeaveGuard(unsaved.length > 0 && !gone);
  // Once, whatever re-renders the screen meanwhile (`onLeave` is a new function each time).
  const left = useRef(false);
  useEffect(() => {
    if (gone && !left.current) {
      left.current = true;
      onLeave();
    }
  }, [gone, onLeave]);
  const dirty = formChanged(form, item) || pending.length > 0 || toRemove.length > 0;
  const busy = saving || remove.isPending || confirm.isPending;

  const tiles: PhotoTile[] = [
    ...savedPhotos.map((image): PhotoTile => ({
      kind: 'saved',
      key: image.id,
      id: image.id,
      url: image.url,
    })),
    ...picked.map((tile): PhotoTile => ({
      kind: 'local',
      key: tile.photo.key,
      photo: tile.photo,
      state: tile.state,
      problem: tile.state === 'failed' ? tile.photo.problem : null,
    })),
  ];

  const upload = async (photos: readonly LocalPhoto[], drop: readonly string[]) => {
    const keys = photos.map((photo) => photo.key);
    setPicked((current) =>
      current.map((tile) =>
        keys.includes(tile.photo.key) ? { ...tile, state: 'uploading' as const } : tile
      )
    );
    let failedKeys: string[] = keys;
    let kept: readonly string[] = drop;
    let problems: Record<string, string | null> = {};
    try {
      const result = await applyPhotos.mutateAsync({ id: item.id, add: photos, remove: drop });
      failedKeys = result.failed;
      kept = result.notRemoved;
      problems = Object.fromEntries(
        result.failed.map((key) => [key, photoRefusal(result.errors[key])])
      );
    } catch {
      // Every one of them is kept for "Try again".
    }
    // A photo that could not be deleted shows again (the deleted ones leave with the refetch).
    setRemoved((current) => current.filter((id) => !kept.includes(id)));
    setPicked((current) =>
      current
        .filter((tile) => !keys.includes(tile.photo.key) || failedKeys.includes(tile.photo.key))
        .map((tile) =>
          failedKeys.includes(tile.photo.key)
            ? {
                photo: { ...tile.photo, problem: problems[tile.photo.key] ?? null },
                state: 'failed' as const,
              }
            : tile
        )
    );
    return failedKeys.length;
  };

  const save = async () => {
    const found = validateCardForm(form);
    setErrors(found);
    if (hasErrors(found)) {
      setMessage(CARD_FORM_COPY.checkFields);
      return;
    }
    setMessage(null);
    setSaving(true);
    try {
      // A save counts as "still available", photos alone included.
      await update.mutateAsync({ id: item.id, patch: toPatch(form, item) ?? { confirm: true } });
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
    const failed =
      pending.length > 0 || toRemove.length > 0
        ? await upload(
            pending.map((tile) => tile.photo),
            toRemove
          )
        : 0;
    setSaving(false);
    markSaved(item.id);
    if (failed > 0) {
      // The card is saved; the photos that were not stay here with "Try again".
      return;
    }
    snackbar.show(item.card.name, {
      title: TOAST_COPY.saved,
      icon: 'success',
      action: {
        label: TOAST_COPY.view,
        testID: 'snackbar-view',
        onPress: () => router.push({ pathname: '/items/[id]', params: { id: item.id } }),
      },
    });
    onLeave();
  };

  const retry = async () => {
    // The photos the API refused stay as they are: trying them again cannot work.
    const failed = unsaved.map((tile) => tile.photo);
    if (failed.length > 0) {
      setSaving(true);
      await upload(failed, []);
      setSaving(false);
    }
  };

  const stillAvailable = async () => {
    try {
      await confirm.mutateAsync(item.id);
      snackbar.show(EDIT_CARD_COPY.confirmed);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const destroy = async () => {
    try {
      await remove.mutateAsync(item.id);
    } catch (error) {
      setAsking(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
      return;
    }
    setAsking(false);
    markSaved(null);
    showCardDeleted({ snackbar, queryClient, uid, markSaved }, item.id, item.card.name);
    // Leaves once the guard of the photos not saved is off (the card is gone with them).
    setGone(true);
  };

  const footer = (
    <>
      <PillButton
        label={dirty ? EDIT_CARD_COPY.save : EDIT_CARD_COPY.noChanges}
        loadingLabel={EDIT_CARD_COPY.saving}
        disabled={!dirty}
        loading={saving}
        onPress={() => void save()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="edit-item-save"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={EDIT_CARD_COPY.delete}
        disabled={busy}
        onPress={() => setAsking(true)}
        testID="edit-item-delete"
        style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('md'), styles.deleteLabel, { color: palette.danger }]}
        >
          {EDIT_CARD_COPY.delete}
        </Text>
      </Pressable>
    </>
  );

  return (
    <InventoryFormScreen
      header={header}
      footer={footer}
      startAtEnd={initialFailed.length > 0}
      testID="screen-edit-item"
    >
      <CardHeader
        name={item.card.name}
        game={item.card.game}
        printing={item.printing}
        printings={card.data?.printings}
        variant="edit"
      />
      {needsConfirmation(item.freshness.state) ? (
        <View
          testID="edit-item-stale"
          style={[
            styles.stale,
            { borderColor: palette.status.stale, backgroundColor: palette.surface },
          ]}
        >
          <Text style={[textStyle('sm'), { color: palette.ink }]}>
            {item.freshness.state === 'HIDDEN'
              ? EDIT_CARD_COPY.hiddenNotice
              : EDIT_CARD_COPY.agingNotice}
          </Text>
          <Button
            label={EDIT_CARD_COPY.stillAvailable}
            loadingLabel={EDIT_CARD_COPY.confirming}
            icon="check-circle-outline"
            variant="secondary"
            loading={confirm.isPending}
            disabled={busy && !confirm.isPending}
            onPress={() => void stillAvailable()}
            testID="edit-item-confirm"
          />
        </View>
      ) : null}
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
        disabled={busy}
        photos={{
          tiles,
          addLabel: CARD_FORM_COPY.addPhoto,
          onAdd: (added) =>
            setPicked((current) =>
              [...current, ...added.map((photo) => ({ photo, state: 'waiting' as const }))].slice(
                0,
                ITEM_PHOTO_MAX_COUNT - savedPhotos.length
              )
            ),
          onRemove: (key) => {
            if (item.images.some((image) => image.id === key)) {
              setRemoved((current) => [...current, key]);
            } else {
              setPicked((current) => current.filter((tile) => tile.photo.key !== key));
            }
          },
          onRetry: () => void retry(),
        }}
      />
      {message ? <FormMessage testID="edit-item-error">{message}</FormMessage> : null}
      <ConfirmSheet
        visible={asking}
        title={EDIT_CARD_COPY.deleteTitle(item.card.name)}
        message={EDIT_CARD_COPY.deleteBody}
        confirmLabel={EDIT_CARD_COPY.deleteConfirm}
        cancelLabel={EDIT_CARD_COPY.keep}
        busy={remove.isPending}
        onConfirm={() => void destroy()}
        onCancel={() => setAsking(false)}
        testID="edit-item-delete-sheet"
      />
      <ConfirmSheet
        visible={guard.asking}
        title={CARD_FORM_COPY.leaveTitle(unsaved.length)}
        message={CARD_FORM_COPY.leaveBody(unsaved.length)}
        confirmLabel={CARD_FORM_COPY.leave}
        cancelLabel={CARD_FORM_COPY.stay}
        onConfirm={guard.leave}
        onCancel={guard.stay}
        testID="edit-item-leave-sheet"
      />
    </InventoryFormScreen>
  );
}

const styles = StyleSheet.create({
  stale: { gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
