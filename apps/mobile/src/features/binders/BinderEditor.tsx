import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import {
  useApplyBinderPhotoChanges,
  useBinder,
  useBinderItems,
  useConfirmBinder,
  useCreateBinder,
  useDeleteBinder,
  useUpdateBinder,
} from '@/src/api/hooks/binders';
import { useBulkInventory } from '@/src/api/hooks/inventory';
import type { BinderResponse, InventoryItemResponse } from '@/src/api/types';
import { BackBar } from '@/src/components/ui/BackBar';
import { Button } from '@/src/components/ui/Button';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text, TextInput } from '@/src/components/ui/Text';
import { VisibilityToggle } from '@/src/features/inventory/CardFormFields';
import { CardPhotos, type PhotoTile } from '@/src/features/inventory/CardPhotos';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { CARD_FORM_COPY } from '@/src/features/inventory/inventoryCopy';
import { InventoryFormScreen } from '@/src/features/inventory/InventoryFormScreen';
import type { LocalPhoto } from '@/src/features/inventory/inventoryUiStore';
import { photoRefusal } from '@/src/features/inventory/itemPhotoRules';
import { ASKING_PRICE_MAX } from '@/src/features/inventory/itemPrice';
import { useCardFindability } from '@/src/features/inventory/useCardFindability';
import { publicCardHint } from '@/src/features/inventory/visibilityStatus';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { needsConfirmation } from '@/src/lib/inventory';
import { isLimitReached } from '@/src/lib/limits';
import {
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { BINDER_TOAST_COPY, EDIT_BINDER_COPY } from './binderCopy';
import {
  BINDER_NAME_MAX,
  BINDER_NOTE_MAX,
  BINDER_PHOTO_MAX,
  binderFormChanged,
  binderFormOf,
  hasBinderErrors,
  toBinderPatch,
  toCreateBinderBody,
  validateBinderForm,
  withDeckCore,
  type BinderFormErrors,
  type BinderFormValue,
} from './binderForm';
import { BinderCardsSection } from './BinderCardsSection';
import { useBinderUiStore } from './binderUiStore';
import { CardPickerSheet } from './CardPickerSheet';

export interface BinderEditorScreenProps {
  /** The binder to edit; `null` for New binder. */
  id: string | null;
}

/**
 * Edit binder and New binder (owner spec 2026-10-14, section 7, mockup screen 18): the name, "Who
 * can see it" (Private | Public, with the card form's hints), the card "Sell as a deck core" with
 * its photos ("{n} / 4"), its asking price (40 characters) and its public note (500), the dashed
 * section "Key cards · optional" (a deck core) or "Cards inside" with "Add cards" (pick from your
 * inventory), "Save changes" (disabled until a change; a save also confirms the binder is still
 * available) and "Delete binder", asked in a sheet. Everything is saved with the button: the
 * fields, then the cards moved in or out, then the photos.
 */
export function BinderEditorScreen({ id }: BinderEditorScreenProps) {
  const router = useRouter();
  const binder = useBinder(id, id !== null);
  const leave = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({ pathname: '/inventory', params: { view: 'binders' } });
    }
  };
  const title = id === null ? EDIT_BINDER_COPY.titleNew : EDIT_BINDER_COPY.titleEdit;
  const header = (action?: ReactNode) => (
    <View style={styles.headerRow}>
      <View style={styles.grow}>
        <BackBar
          label={title}
          backLabel={EDIT_BINDER_COPY.backLabel}
          onBack={leave}
          testID="edit-binder-back"
        />
      </View>
      {action}
    </View>
  );

  if (id === null || binder.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, title }} />
        <BinderEditor
          key={binder.data?.id ?? 'new'}
          binder={binder.data ?? null}
          header={header}
          onLeave={leave}
        />
      </>
    );
  }
  let content;
  if (binder.error?.status === 404 || binder.error?.errorCode === 'VALIDATION_FAILED') {
    content = (
      <EmptyState
        testID="edit-binder-not-found"
        icon="book-open-page-variant-outline"
        title={EDIT_BINDER_COPY.notFoundTitle}
        description={EDIT_BINDER_COPY.notFoundBody}
        actionLabel={EDIT_BINDER_COPY.notFoundAction}
        onAction={() => router.navigate({ pathname: '/inventory', params: { view: 'binders' } })}
      />
    );
  } else if (binder.error) {
    content = (
      <ErrorState
        testID="edit-binder-error"
        error={binder.error}
        title={EDIT_BINDER_COPY.loadError}
        onRetry={() => void binder.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={5} rowHeight={64} testID="edit-binder-loading" />;
  }
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title }} />
      <InventoryFormScreen header={header()} testID="screen-edit-binder">
        {content}
      </InventoryFormScreen>
    </>
  );
}

interface LocalTile {
  photo: LocalPhoto;
  state: 'waiting' | 'uploading' | 'failed';
}

function BinderEditor({
  binder,
  header,
  onLeave,
}: {
  binder: BinderResponse | null;
  header: (action?: ReactNode) => ReactNode;
  onLeave: () => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const findability = useCardFindability();
  const create = useCreateBinder();
  const update = useUpdateBinder();
  const confirm = useConfirmBinder();
  const remove = useDeleteBinder();
  const bulk = useBulkInventory();
  const applyPhotos = useApplyBinderPhotoChanges();
  const keepFailedPhotos = useBinderUiStore((state) => state.keepFailedPhotos);
  const takeFailedPhotos = useBinderUiStore((state) => state.takeFailedPhotos);
  const items = useBinderItems(binder?.id ?? '', '', binder !== null);

  const [form, setForm] = useState<BinderFormValue>(() => binderFormOf(binder));
  const [errors, setErrors] = useState<BinderFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  // Photos New binder could not upload: this screen takes them over, with "Try again".
  const [initialFailed] = useState(() =>
    binder ? (useBinderUiStore.getState().failedPhotos[binder.id] ?? []) : []
  );
  const [picked, setPicked] = useState<LocalTile[]>(() =>
    initialFailed.map((photo) => ({ photo, state: 'failed' as const }))
  );
  useEffect(() => {
    if (binder) {
      takeFailedPhotos(binder.id);
    }
  }, [binder, takeFailedPhotos]);
  useEffect(() => {
    const count = initialFailed.filter((photo) => !photo.problem).length;
    if (count > 0) {
      AccessibilityInfo.announceForAccessibility?.(CARD_FORM_COPY.photoFailed(count));
    }
  }, [initialFailed]);
  const [removedPhotos, setRemovedPhotos] = useState<readonly string[]>([]);
  // Cards picked from the inventory (moved in with "Save changes") and cards taken out.
  const [added, setAdded] = useState<ReadonlyMap<string, InventoryItemResponse>>(new Map());
  const [takenOut, setTakenOut] = useState<ReadonlySet<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [gone, setGone] = useState(false);
  const [showEnd, setShowEnd] = useState(0);

  const savedPhotos = (binder?.photos ?? []).filter((photo) => !removedPhotos.includes(photo.id));
  const toRemove = removedPhotos.filter((photoId) =>
    (binder?.photos ?? []).some((photo) => photo.id === photoId)
  );
  const pending = picked.filter((tile) => tile.state !== 'failed');
  const unsaved = picked.filter((tile) => tile.state === 'failed' && !tile.photo.problem);
  const guard = useLeaveGuard(unsaved.length > 0 && !gone);
  const left = useRef(false);
  useEffect(() => {
    if (gone && !left.current) {
      left.current = true;
      onLeave();
    }
  }, [gone, onLeave]);

  const cardsChanged = added.size > 0 || takenOut.size > 0;
  const photosChanged = pending.length > 0 || toRemove.length > 0;
  const dirty = binder
    ? binderFormChanged(form, binder) || cardsChanged || photosChanged
    : form.name.trim().length > 0;
  const busy = saving || remove.isPending || confirm.isPending;

  const savedItems = useMemo(
    () => items.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [items.data]
  );

  const tiles: PhotoTile[] = [
    ...savedPhotos.map((photo): PhotoTile => ({
      kind: 'saved',
      key: photo.id,
      id: photo.id,
      url: photo.url,
    })),
    ...picked.map((tile): PhotoTile => ({
      kind: 'local',
      key: tile.photo.key,
      photo: tile.photo,
      state: tile.state,
      problem: tile.state === 'failed' ? tile.photo.problem : null,
    })),
  ];

  const change = (patch: Partial<BinderFormValue>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) {
        if (key === 'name' || key === 'price' || key === 'note') {
          delete next[key];
        }
      }
      return next;
    });
  };

  /** Uploads (and deletes) photos of a saved binder; returns how many could not be uploaded. */
  const upload = async (
    binderId: string,
    photos: readonly LocalPhoto[],
    drop: readonly string[]
  ) => {
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
      const result = await applyPhotos.mutateAsync({ id: binderId, add: photos, remove: drop });
      failedKeys = result.failed;
      kept = result.notRemoved;
      problems = Object.fromEntries(
        result.failed.map((key) => {
          const error = result.errors[key];
          return [key, error?.status === 409 ? EDIT_BINDER_COPY.photoFull : photoRefusal(error)];
        })
      );
    } catch {
      // Every one of them is kept for "Try again".
    }
    setRemovedPhotos((current) => current.filter((photoId) => !kept.includes(photoId)));
    const failed = picked
      .filter((tile) => failedKeys.includes(tile.photo.key))
      .map((tile) => ({ ...tile.photo, problem: problems[tile.photo.key] ?? null }));
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
    return failed;
  };

  /** Moves the picked cards in and the taken-out ones out (one bulk request each). */
  const moveCards = async (binderId: string) => {
    if (takenOut.size > 0) {
      // Without a binder id the cards become unfiled.
      await bulk.mutateAsync({ action: 'MOVE_TO_BINDER', itemIds: [...takenOut] });
    }
    if (added.size > 0) {
      const ids = [...added.keys()];
      await bulk.mutateAsync({ action: 'MOVE_TO_BINDER', binderId, itemIds: ids });
      if (form.sellsAsCore) {
        // A deck core's cards show to buyers with it: a card picked private becomes public, and
        // the binder decides who sees it (decision of stage R3).
        await bulk.mutateAsync({ action: 'SET_VISIBILITY', visibility: 'PUBLIC', itemIds: ids });
      }
    }
    setAdded(new Map());
    setTakenOut(new Set());
  };

  const save = async () => {
    const found = validateBinderForm(form);
    setErrors(found);
    setFailure(null);
    if (hasBinderErrors(found)) {
      setMessage(EDIT_BINDER_COPY.checkFields);
      return;
    }
    setMessage(null);
    setSaving(true);
    let saved: BinderResponse;
    try {
      saved = binder
        ? await update.mutateAsync({ id: binder.id, patch: toBinderPatch(form, binder) })
        : await create.mutateAsync(toCreateBinderBody(form));
    } catch (error) {
      const apiError = error as ApiError;
      setFailure(apiError);
      setErrors({
        name: apiError.fieldErrors?.name,
        price: apiError.fieldErrors?.askingPriceText,
        note: apiError.fieldErrors?.description,
      });
      setMessage(isLimitReached(apiError) ? null : friendlyMessage(apiError));
      setSaving(false);
      return;
    }
    try {
      await moveCards(saved.id);
    } catch (error) {
      setSaving(false);
      setMessage(friendlyMessage(error as ApiError));
      if (!binder) {
        // The binder exists now: its own screen keeps the rest of the work.
        router.replace({ pathname: '/binders/edit', params: { id: saved.id } });
      }
      return;
    }
    const failed =
      pending.length > 0 || toRemove.length > 0
        ? await upload(
            saved.id,
            pending.map((tile) => tile.photo),
            toRemove
          )
        : [];
    setSaving(false);
    if (failed.length > 0) {
      snackbar.show(saved.name, { title: BINDER_TOAST_COPY.savedPhotosFailed(failed.length) });
      if (!binder) {
        // New binder: Edit binder of the binder just made opens on the photos to try again.
        keepFailedPhotos(saved.id, failed);
        router.replace({ pathname: '/binders/edit', params: { id: saved.id } });
      } else {
        setShowEnd((count) => count + 1);
      }
      return;
    }
    snackbar.show(saved.name, { title: BINDER_TOAST_COPY.saved, icon: 'success' });
    onLeave();
  };

  const retry = async () => {
    if (!binder) {
      return;
    }
    const failed = unsaved.map((tile) => tile.photo);
    if (failed.length > 0) {
      setSaving(true);
      await upload(binder.id, failed, []);
      setSaving(false);
    }
  };

  const stillAvailable = async () => {
    if (!binder) {
      return;
    }
    try {
      await confirm.mutateAsync(binder.id);
      snackbar.show(EDIT_BINDER_COPY.confirmed);
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const destroy = async () => {
    if (!binder) {
      return;
    }
    try {
      await remove.mutateAsync(binder.id);
    } catch (error) {
      setAsking(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
      return;
    }
    setAsking(false);
    snackbar.show(binder.name, { title: BINDER_TOAST_COPY.deleted, icon: 'deleted' });
    setGone(true);
  };

  // The hint under "Who can see it": a private deck core says buyers cannot find it (in the
  // warning colour, as the mockup), otherwise the card form's hints (section 7).
  const privateCore = form.sellsAsCore && form.visibility === 'PRIVATE';
  const hint = privateCore
    ? { findable: false, text: EDIT_BINDER_COPY.privateCoreHint }
    : form.visibility === 'PRIVATE'
      ? { findable: true, text: CARD_FORM_COPY.privateHint }
      : publicCardHint(
          findability,
          null,
          undefined,
          binder ? { item: binder, changed: dirty } : null
        );

  const publicPage =
    binder?.effectivePublic && !dirty ? (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={EDIT_BINDER_COPY.publicPage}
        onPress={() =>
          router.push({ pathname: '/binders/[id]', params: { id: binder.id, view: 'public' } })
        }
        hitSlop={4}
        testID="edit-binder-public-page"
        style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="eye-outline" size={22} color={palette.ink} />
      </Pressable>
    ) : undefined;

  const footer = (
    <>
      <PillButton
        label={
          binder
            ? dirty
              ? EDIT_BINDER_COPY.save
              : EDIT_BINDER_COPY.noChanges
            : EDIT_BINDER_COPY.create
        }
        loadingLabel={binder ? EDIT_BINDER_COPY.saving : EDIT_BINDER_COPY.creating}
        disabled={!dirty}
        loading={saving}
        onPress={() => void save()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="edit-binder-save"
      />
      {binder ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={EDIT_BINDER_COPY.delete}
          disabled={busy}
          onPress={() => setAsking(true)}
          testID="edit-binder-delete"
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        >
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[textStyle('md'), styles.deleteLabel, { color: palette.danger }]}
          >
            {EDIT_BINDER_COPY.delete}
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  const inputStyle = [
    textStyle('md'),
    styles.input,
    { color: palette.ink, backgroundColor: palette.surface, borderColor: palette.borderStrong },
  ];

  return (
    <InventoryFormScreen
      header={header(publicPage)}
      footer={footer}
      startAtEnd={initialFailed.length > 0}
      showEnd={showEnd}
      testID={binder ? 'screen-edit-binder' : 'screen-new-binder'}
    >
      {binder && needsConfirmation(binder.freshness.state) ? (
        <View
          testID="edit-binder-stale"
          style={[
            styles.stale,
            { borderColor: palette.status.stale, backgroundColor: palette.surface },
          ]}
        >
          <Text style={[textStyle('sm'), { color: palette.ink }]}>
            {binder.freshness.state === 'HIDDEN'
              ? EDIT_BINDER_COPY.hiddenNotice
              : EDIT_BINDER_COPY.agingNotice}
          </Text>
          <Button
            label={EDIT_BINDER_COPY.stillAvailable}
            loadingLabel={EDIT_BINDER_COPY.confirming}
            icon="check-circle-outline"
            variant="secondary"
            loading={confirm.isPending}
            disabled={busy && !confirm.isPending}
            onPress={() => void stillAvailable()}
            testID="edit-binder-confirm"
          />
        </View>
      ) : null}

      <Field label={EDIT_BINDER_COPY.name} error={errors.name}>
        <TextInput
          value={form.name}
          onChangeText={(name) => change({ name })}
          placeholder={EDIT_BINDER_COPY.namePlaceholder}
          placeholderTextColor={palette.textDisabled}
          maxLength={BINDER_NAME_MAX + 10}
          editable={!busy}
          accessibilityLabel={EDIT_BINDER_COPY.name}
          testID="binder-name"
          style={[
            ...inputStyle,
            styles.nameInput,
            errors.name ? { borderColor: palette.danger } : null,
          ]}
        />
      </Field>

      <View style={styles.field}>
        <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
          {EDIT_BINDER_COPY.whoCanSee}
        </Text>
        <VisibilityToggle
          value={form.visibility}
          onChange={(visibility) => change({ visibility })}
          disabled={busy}
          testIDPrefix="binder-visibility"
        />
        <View style={styles.hintRow}>
          {hint.findable ? null : (
            <MaterialCommunityIcons
              name={privateCore ? 'alert-outline' : 'eye-off-outline'}
              size={16}
              color={privateCore ? palette.warning : palette.status.stale}
              style={styles.hintIcon}
            />
          )}
          <Text
            testID="binder-visibility-hint"
            style={[
              textStyle('xs'),
              styles.grow,
              {
                color: privateCore
                  ? palette.warning
                  : hint.findable
                    ? palette.textMuted
                    : palette.ink,
              },
            ]}
          >
            {hint.text}
          </Text>
        </View>
      </View>

      <View
        testID="binder-core-card"
        style={[
          styles.coreCard,
          {
            backgroundColor: palette.deckCore.surface,
            borderColor: form.sellsAsCore ? palette.deckCore.border : palette.border,
          },
        ]}
      >
        <View style={styles.coreHead}>
          <View style={styles.grow}>
            <Text style={[styles.coreTitle, { color: palette.ink }]}>
              {EDIT_BINDER_COPY.coreTitle}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {EDIT_BINDER_COPY.coreHint}
            </Text>
          </View>
          <Switch
            value={form.sellsAsCore}
            onValueChange={(on) => {
              setForm((current) => withDeckCore(current, on));
              setErrors((current) => ({ name: current.name }));
            }}
            disabled={busy}
            accessibilityLabel={EDIT_BINDER_COPY.coreTitle}
            accessibilityHint={EDIT_BINDER_COPY.coreHint}
            trackColor={{ false: palette.borderStrong, true: palette.deckCore.switch }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={palette.borderStrong}
            testID="binder-deck-core-switch"
          />
        </View>
        {form.sellsAsCore ? (
          <View style={styles.coreFields}>
            <CardPhotos
              tiles={tiles}
              addLabel={EDIT_BINDER_COPY.addPhoto}
              hint={null}
              testID="binder-photos"
              disabled={busy}
              onAdd={(photos) =>
                setPicked((current) =>
                  [
                    ...current,
                    ...photos.map((photo) => ({ photo, state: 'waiting' as const })),
                  ].slice(0, BINDER_PHOTO_MAX - savedPhotos.length)
                )
              }
              onRemove={(key) => {
                if ((binder?.photos ?? []).some((photo) => photo.id === key)) {
                  setRemovedPhotos((current) => [...current, key]);
                } else {
                  setPicked((current) => current.filter((tile) => tile.photo.key !== key));
                }
              }}
              onRetry={() => void retry()}
            />
            <Field label={EDIT_BINDER_COPY.askingPrice} error={errors.price}>
              <TextInput
                value={form.price}
                onChangeText={(price) => change({ price })}
                placeholder={EDIT_BINDER_COPY.pricePlaceholder}
                placeholderTextColor={palette.textDisabled}
                maxLength={ASKING_PRICE_MAX + 10}
                autoCorrect={false}
                editable={!busy}
                accessibilityLabel={EDIT_BINDER_COPY.askingPrice}
                accessibilityHint={EDIT_BINDER_COPY.pricePlaceholder}
                testID="binder-price"
                style={[
                  ...inputStyle,
                  styles.priceInput,
                  errors.price ? { borderColor: palette.danger } : null,
                ]}
              />
            </Field>
            <Field
              label={EDIT_BINDER_COPY.note}
              counter={EDIT_BINDER_COPY.counter(form.note.length, BINDER_NOTE_MAX)}
              error={errors.note}
            >
              <TextInput
                value={form.note}
                onChangeText={(note) => change({ note })}
                placeholder={EDIT_BINDER_COPY.notePlaceholder}
                placeholderTextColor={palette.textDisabled}
                maxLength={Math.max(BINDER_NOTE_MAX, binder?.description.length ?? 0)}
                multiline
                editable={!busy}
                accessibilityLabel={EDIT_BINDER_COPY.note}
                testID="binder-note"
                style={[
                  ...inputStyle,
                  styles.note,
                  errors.note ? { borderColor: palette.danger } : null,
                ]}
              />
            </Field>
          </View>
        ) : null}
      </View>

      <BinderCardsSection
        deckCore={form.sellsAsCore}
        saved={savedItems}
        added={[...added.values()]}
        takenOut={takenOut}
        loading={binder !== null && !items.data && !items.error}
        error={items.data ? null : (items.error ?? null)}
        onRetry={() => void items.refetch()}
        hasMore={!!items.hasNextPage}
        loadingMore={items.isFetchingNextPage}
        onMore={() => void items.fetchNextPage()}
        disabled={busy}
        onAdd={() => setPicking(true)}
        onTakeOut={(item) =>
          setTakenOut((current) => {
            const next = new Set(current);
            if (next.has(item.id)) {
              next.delete(item.id);
            } else {
              next.add(item.id);
            }
            return next;
          })
        }
        onDropAdded={(item) =>
          setAdded((current) => {
            const next = new Map(current);
            next.delete(item.id);
            return next;
          })
        }
      />

      {failure && isLimitReached(failure) ? (
        <LimitReachedNotice
          error={failure}
          title={EDIT_BINDER_COPY.limitTitle}
          testID="binder-limit"
        />
      ) : null}
      {message ? <FormMessage testID="edit-binder-error">{message}</FormMessage> : null}

      <CardPickerSheet
        visible={picking}
        binderId={binder?.id ?? null}
        excluded={new Set(added.keys())}
        deckCore={form.sellsAsCore}
        onPick={(items) =>
          setAdded((current) => {
            const next = new Map(current);
            for (const item of items) {
              next.set(item.id, item);
            }
            return next;
          })
        }
        onClose={() => setPicking(false)}
      />
      {binder ? (
        <ConfirmSheet
          visible={asking}
          title={EDIT_BINDER_COPY.deleteTitle(binder.name)}
          message={
            binder.sellsAsCore ? EDIT_BINDER_COPY.deleteBody : EDIT_BINDER_COPY.deleteBodyPlain
          }
          confirmLabel={EDIT_BINDER_COPY.deleteConfirm}
          cancelLabel={EDIT_BINDER_COPY.keep}
          busy={remove.isPending}
          onConfirm={() => void destroy()}
          onCancel={() => setAsking(false)}
          testID="edit-binder-delete-sheet"
        />
      ) : null}
      <ConfirmSheet
        visible={guard.asking}
        title={CARD_FORM_COPY.leaveTitle(unsaved.length)}
        message={CARD_FORM_COPY.leaveBody(unsaved.length)}
        confirmLabel={CARD_FORM_COPY.leave}
        cancelLabel={CARD_FORM_COPY.stay}
        onConfirm={guard.leave}
        onCancel={guard.stay}
        testID="edit-binder-leave-sheet"
      />
    </InventoryFormScreen>
  );
}

function Field({
  label,
  counter,
  error,
  children,
}: {
  label: string;
  counter?: string;
  error?: string;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[textStyle('sm'), styles.label, styles.grow, { color: palette.ink }]}>
          {label}
        </Text>
        {counter ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{counter}</Text>
        ) : null}
      </View>
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={[textStyle('xs'), { color: palette.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  label: { fontWeight: fontWeight.semibold },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: spacing[2],
  },
  nameInput: { fontWeight: fontWeight.semibold },
  priceInput: { fontWeight: fontWeight.semibold },
  note: { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  hintIcon: { marginTop: 1 },
  coreCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  coreHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coreTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  coreFields: { gap: 12 },
  stale: { gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
