import { useRouter } from 'expo-router';

import { useCreateBinder } from '@/src/api/hooks/binders';
import { Screen } from '@/src/components/ui/Screen';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { BinderForm, binderDraft } from '@/src/features/binders/BinderForm';

/** New binder (web: the binder form dialog): private at first, then it opens. */
export default function NewBinderScreen() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const create = useCreateBinder();
  return (
    <Screen scroll safeBottom testID="screen-new-binder">
      <BinderForm
        initial={binderDraft()}
        editing={false}
        saving={create.isPending}
        onSave={async (draft) => {
          const binder = await create.mutateAsync({
            name: draft.name,
            kind: draft.kind,
            description: draft.description || undefined,
          });
          snackbar.show(`Binder “${binder.name}” created.`);
          router.replace({ pathname: '/binders/[id]', params: { id: binder.id } });
        }}
        onCancel={() => (router.canGoBack() ? router.back() : router.replace('/inventory'))}
      />
    </Screen>
  );
}
