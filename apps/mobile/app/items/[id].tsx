import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useMyBinders } from '@/src/api/hooks/binders';
import {
  useConfirmInventoryItem,
  useDeleteInventoryItem,
  useInventoryItem,
  useUpdateInventoryItem,
} from '@/src/api/hooks/inventory';
import { usePrivacySettings } from '@/src/api/hooks/location';
import { useGames } from '@/src/api/hooks/profile';
import type { InventoryItemResponse } from '@/src/api/types';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { CardImage } from '@/src/components/ui/CardImage';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { ItemDetailsFields } from '@/src/features/inventory/ItemDetailsFields';
import {
  hasErrors,
  itemFormValue,
  serverItemErrors,
  toUpdateRequest,
  validateItemForm,
  type ItemFormErrors,
  type ItemFormValue,
} from '@/src/features/inventory/itemForm';
import { itemVisibilityStatus, ownerIsVisible } from '@/src/features/inventory/visibilityStatus';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { badgeFreshness, needsConfirmation } from '@/src/lib/inventory';
import { isLimitReached } from '@/src/lib/limits';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Edit one of the collector's cards (web: the inventory edit panel): every field, sent as a
 * `PATCH` of the changed fields only; "Still available" restores a stale or hidden listing
 * (`POST .../confirm`); delete asks first.
 */
export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useInventoryItem(id);
  const router = useRouter();

  let content;
  if (item.data) {
    content = <ItemEditor key={item.data.id} item={item.data} />;
  } else if (item.error?.status === 404 || item.error?.errorCode === 'VALIDATION_FAILED') {
    content = (
      <EmptyState
        testID="edit-item-not-found"
        icon="cards-outline"
        title="This card is no longer in your inventory"
        description="It may have been deleted on another device."
        actionLabel="Back to the inventory"
        onAction={() => router.navigate('/inventory')}
      />
    );
  } else if (item.error) {
    content = (
      <ErrorState
        testID="edit-item-error"
        error={item.error}
        title="This card could not load"
        onRetry={() => void item.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={4} rowHeight={72} testID="edit-item-loading" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: item.data?.card.name ?? 'Card' }} />
      <Screen scroll safeBottom testID="screen-edit-item">
        {content}
      </Screen>
    </>
  );
}

function ItemEditor({ item }: { item: InventoryItemResponse }) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const games = useGames();
  const binders = useMyBinders();
  const privacy = usePrivacySettings();
  const update = useUpdateInventoryItem();
  const confirm = useConfirmInventoryItem();
  const remove = useDeleteInventoryItem();
  const [form, setForm] = useState<ItemFormValue>(() => itemFormValue(item));
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const schema = games.data?.find((game) => game.slug === item.card.game)?.schema ?? null;
  const binder = item.binder
    ? binders.data?.find((candidate) => candidate.id === item.binder?.id)
    : null;
  const status = itemVisibilityStatus(item, {
    binder,
    ownerVisible: ownerIsVisible(privacy.data),
  });
  const busy = update.isPending || confirm.isPending || remove.isPending;

  const save = async () => {
    const found = validateItemForm(form);
    setErrors(found);
    setFailure(null);
    if (hasErrors(found)) {
      setMessage('Check the highlighted fields.');
      return;
    }
    const patch = toUpdateRequest(form, item);
    if (!patch) {
      setMessage(null);
      snackbar.show('No changes to save.');
      return;
    }
    setMessage(null);
    try {
      const saved = await update.mutateAsync({ id: item.id, patch });
      setForm(itemFormValue(saved));
      snackbar.show('Card saved.');
    } catch (error) {
      const apiError = error as ApiError;
      setErrors(serverItemErrors(apiError));
      setFailure(apiError);
      setMessage(isLimitReached(apiError) ? null : friendlyMessage(apiError));
    }
  };

  const stillAvailable = async () => {
    try {
      await confirm.mutateAsync(item.id);
      snackbar.show('Confirmed: your card is listed as available again.');
    } catch (error) {
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  const destroy = async () => {
    try {
      await remove.mutateAsync(item.id);
      setConfirmDelete(false);
      snackbar.show(`${item.card.name} deleted from your inventory.`);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/inventory');
      }
    } catch (error) {
      setConfirmDelete(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <CardImage
          src={printingImageUrl(item.printing)}
          alt={item.card.name}
          game={item.card.game}
          size="md"
        />
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            testID="edit-item-name"
            style={[textStyle('xl', 'heading'), styles.name, { color: palette.ink }]}
          >
            {item.card.name}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            <Text style={styles.mono}>{printingCode(item.printing)}</Text>
            {item.printing.setName ? ` · ${item.printing.setName}` : ''}
          </Text>
          <Text
            testID="edit-item-visibility"
            style={[
              textStyle('sm'),
              styles.status,
              { color: status.pending ? palette.warning : palette.ink },
            ]}
          >
            {status.label}
          </Text>
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{status.note}</Text>
          <View style={styles.freshness}>
            <Badge variant="freshness" value={badgeFreshness(item.freshness.state)} />
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {item.freshness.label}
            </Text>
          </View>
        </View>
      </View>

      {needsConfirmation(item.freshness.state) ? (
        <View
          testID="edit-item-stale"
          style={[
            styles.stale,
            { borderColor: palette.status.stale, backgroundColor: palette.surfaceVariant },
          ]}
        >
          <Text style={[textStyle('sm'), { color: palette.ink }]}>
            {item.freshness.state === 'HIDDEN'
              ? 'This listing is hidden from other collectors until you confirm it is still available.'
              : 'This listing is getting old. Confirm it is still available to keep it fresh.'}
          </Text>
          <Button
            label="Still available"
            loadingLabel="Confirming…"
            icon="check-circle-outline"
            variant="secondary"
            loading={confirm.isPending}
            disabled={busy && !confirm.isPending}
            onPress={() => void stillAvailable()}
            testID="edit-item-confirm"
          />
        </View>
      ) : null}

      <ItemDetailsFields
        value={form}
        onChange={(patch) => {
          setForm((current) => ({ ...current, ...patch }));
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
        currentPublicUntil={item.visibility === 'TEMPORARILY_PUBLIC' ? item.publicUntil : null}
        disabled={busy}
      />

      {failure && isLimitReached(failure) ? <LimitReachedNotice error={failure} /> : null}
      {message ? <FormMessage testID="edit-item-error">{message}</FormMessage> : null}

      <Button
        label="Save changes"
        loadingLabel="Saving…"
        icon="content-save-outline"
        loading={update.isPending}
        disabled={busy && !update.isPending}
        onPress={() => void save()}
        testID="edit-item-save"
      />
      <Button
        label="Delete card"
        icon="delete-outline"
        variant="danger"
        disabled={busy}
        onPress={() => setConfirmDelete(true)}
        testID="edit-item-delete"
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${item.card.name}?`}
        message={`${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'} will be removed from your inventory${item.binder ? ` and from “${item.binder.name}”` : ''}. This cannot be undone.`}
        confirmLabel="Delete card"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void destroy()}
        onCancel={() => setConfirmDelete(false)}
        testID="edit-item-delete-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  header: { flexDirection: 'row', gap: spacing[3] },
  grow: { flex: 1, gap: spacing[1] },
  name: { fontWeight: fontWeight.bold },
  mono: { fontFamily: fontFamily.mono },
  status: { fontWeight: fontWeight.semibold, marginTop: spacing[1] },
  freshness: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] },
  stale: { gap: spacing[2], padding: spacing[3], borderRadius: radius.md, borderWidth: 1 },
});
