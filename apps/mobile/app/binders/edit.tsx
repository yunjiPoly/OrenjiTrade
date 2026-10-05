import { useLocalSearchParams, useRouter } from 'expo-router';

import { useBinder, useUpdateBinder } from '@/src/api/hooks/binders';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { BinderForm, binderDraft } from '@/src/features/binders/BinderForm';

/** Edit a binder (`/binders/edit?id=`): rename it, change its kind or description. */
export default function EditBinderScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const snackbar = useSnackbar();
  const binder = useBinder(id);
  const update = useUpdateBinder();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/inventory'));

  let content;
  if (binder.data) {
    const current = binder.data;
    content = (
      <BinderForm
        key={current.id}
        initial={binderDraft(current)}
        editing
        saving={update.isPending}
        onSave={async (draft) => {
          await update.mutateAsync({
            id: current.id,
            patch: { name: draft.name, kind: draft.kind, description: draft.description },
          });
          snackbar.show('Binder saved.');
          close();
        }}
        onCancel={close}
      />
    );
  } else if (
    binder.error?.status === 404 ||
    binder.error?.errorCode === 'VALIDATION_FAILED' ||
    !id
  ) {
    content = (
      <EmptyState
        testID="edit-binder-not-found"
        icon="book-open-page-variant-outline"
        title="Binder not found"
        description="It may have been deleted."
        actionLabel="Back to your binders"
        onAction={() => router.navigate({ pathname: '/inventory', params: { view: 'binders' } })}
      />
    );
  } else if (binder.error) {
    content = (
      <ErrorState
        testID="edit-binder-error"
        error={binder.error}
        title="This binder could not load"
        onRetry={() => void binder.refetch()}
      />
    );
  } else {
    content = <SkeletonList rows={3} rowHeight={56} />;
  }

  return (
    <Screen scroll safeBottom testID="screen-edit-binder">
      {content}
    </Screen>
  );
}
