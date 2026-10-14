import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useCommitImport, useInventoryImport } from '@/src/api/hooks/inventoryImport';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { ImportSource, InventoryImport } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { ImportFileStep } from '@/src/features/inventory/import/ImportFileStep';
import {
  clockTime,
  interruptedText,
  isExpired,
} from '@/src/features/inventory/import/importLabels';
import { ImportPreview, isImportGone } from '@/src/features/inventory/import/ImportPreview';
import { ImportResult } from '@/src/features/inventory/import/ImportResult';
import { ImportStart } from '@/src/features/inventory/import/ImportStart';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';
import { isLimitReached } from '@/src/lib/limits';
import { spacing, textStyle, useTheme } from '@/src/theme';

type Step =
  | { name: 'start' }
  | { name: 'file'; source: ImportSource; replaces: InventoryImport | null }
  | { name: 'import'; id: string }
  | { name: 'expired' };

/**
 * "Import cards" (stage S5, opened from the Inventory tab): a Yu-Gi-Oh! deck file (.ydk) or a
 * Collectr CSV export becomes a preview the collector checks and edits, then commits.
 *
 * source → file (choose a file, or paste its text) → preview → result. The preview is kept by the
 * API for a while, so the flow picks up an import that was left open; one that expired says so
 * and starts over. Nothing reaches the inventory before the commit, new cards are private, and a
 * commit sent twice adds nothing twice.
 */
export default function ImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  // "Import a deck" / "Import from Collectr" on Add cards (stage R2) name the source: its file
  // step follows at once, unless an import is left open (then the start shows it first).
  const named = params.source === 'YDK' || params.source === 'COLLECTR_CSV' ? params.source : null;
  const [chosen, setChosen] = useState<ImportSource | null>(named);
  const [step, setStep] = useState<Step>({ name: 'start' });
  const [draft, setDraft] = useState(false);
  // Cards whose last change reached the API after the import had been added (see ImportPreview).
  const [late, setLate] = useState<string[] | null>(null);
  const importId = step.name === 'import' ? step.id : null;
  const current = useInventoryImport(importId);
  const preview = importId ? (current.data ?? null) : null;

  const expire = useCallback(() => setStep({ name: 'expired' }), []);
  const restart = useCallback(() => {
    setLate(null);
    setStep({ name: 'start' });
  }, []);
  const chooseSource = useCallback((source: ImportSource, left: InventoryImport | null) => {
    // Chosen once: back from the file step shows the start, not the file step again.
    setChosen(null);
    setStep({ name: 'file', source, replaces: left });
  }, []);
  const open = useCallback((id: string) => {
    setLate(null);
    setStep({ name: 'import', id });
  }, []);
  const lateEdit = useCallback(
    (card: string | null) => setLate((names) => [...(names ?? []), ...(card ? [card] : [])]),
    []
  );

  // A preview is used until `expiresAt`: past it, the flow says so without waiting for a refusal.
  const expiresAt = preview?.status === 'PENDING' ? preview.expiresAt : null;
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) {
      return undefined;
    }
    const left = Date.parse(expiresAt) - Date.now();
    // Timers cap near 24 days; a preview lives an hour.
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(Math.max(left, 0), 2_000_000_000) + 50
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  // Gone for the API (expired, purged or replaced), or past its time on this device's clock.
  const gone = step.name === 'import' && !current.data && isImportGone(current.error);
  const expired =
    step.name === 'expired' ||
    gone ||
    (step.name === 'import' && preview !== null && isExpired(preview, clock));

  const editing = step.name === 'import' && !expired && preview?.status === 'PENDING';
  const guard = useLeaveGuard(editing || (step.name === 'file' && draft));

  const toInventory = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/inventory');
    }
  };

  let body;
  if (step.name === 'start') {
    body = (
      <Screen scroll safeBottom testID="screen-import">
        <ImportStart
          chosen={chosen}
          onSource={chooseSource}
          onContinue={(left) => {
            // The import left open was chosen instead: back at the start, the start shows.
            setChosen(null);
            open(left.id);
          }}
        />
      </Screen>
    );
  } else if (step.name === 'file') {
    // The paste field is several lines high and has no key that puts the keyboard away: a drag
    // of the page does, so "Use this text" under it can be reached.
    body = (
      <Screen scroll safeBottom keyboardDismissMode="on-drag" testID="screen-import">
        <ImportFileStep
          source={step.source}
          replaces={step.replaces}
          onUploaded={(uploaded) => open(uploaded.id)}
          // Opened on its source from Add cards: back goes back there.
          onBack={named && !step.replaces ? toInventory : restart}
          onDraft={setDraft}
        />
      </Screen>
    );
  } else if (expired) {
    // These three scroll like every other step: at the largest text sizes a title and its
    // sentence are taller than the screen, and the button under them must stay in reach.
    body = (
      <Screen scroll safeBottom contentContainerStyle={styles.centred} testID="screen-import">
        <EmptyState
          testID="import-expired"
          icon="timer-off-outline"
          title="This preview expired"
          description="A preview is only kept for a while. Nothing was added to your inventory: start again with your file."
          actionLabel="Start over"
          onAction={restart}
        />
      </Screen>
    );
  } else if (!preview && current.error) {
    body = (
      <Screen scroll safeBottom contentContainerStyle={styles.centred} testID="screen-import">
        <ErrorState
          testID="import-error"
          error={current.error}
          title="The import could not load"
          onRetry={() => void current.refetch()}
        />
      </Screen>
    );
  } else if (!preview) {
    body = (
      <Screen scroll safeBottom testID="screen-import">
        <SkeletonList rows={4} rowHeight={120} testID="import-loading" />
      </Screen>
    );
  } else if (preview.status === 'COMMITTED') {
    body = (
      <Screen scroll safeBottom testID="screen-import">
        <ImportResult
          preview={preview}
          lateEdits={late}
          onInventory={toInventory}
          onAnother={restart}
        />
      </Screen>
    );
  } else if (preview.status === 'COMMITTING') {
    body = (
      <Screen scroll safeBottom testID="screen-import">
        <ImportInterrupted preview={preview} />
      </Screen>
    );
  } else {
    body = (
      <Screen edgeToEdge testID="screen-import">
        <ImportPreview
          preview={preview}
          onGone={expire}
          onDiscarded={restart}
          onLateEdit={lateEdit}
        />
      </Screen>
    );
  }

  return (
    <>
      {body}
      <ConfirmDialog
        visible={guard.asking}
        title="Leave this import?"
        message={
          editing && preview
            ? `Nothing has been added to your inventory yet. Your preview and the choices you made are kept until ${clockTime(preview.expiresAt)}: open Import again to continue.`
            : 'Nothing has been added to your inventory. The text you pasted is not kept.'
        }
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={guard.leave}
        onCancel={guard.stay}
        testID="import-leave-dialog"
      />
    </>
  );
}

/**
 * A commit that was cut between two parts (a large import is written in parts; the connection
 * dropped, or the app was closed): what is in, and one button to finish. The API continues after
 * the last part it wrote, so nothing is added twice.
 */
function ImportInterrupted({ preview }: { preview: InventoryImport }) {
  const { palette } = useTheme();
  const uid = useUid();
  const queryClient = useQueryClient();
  const commit = useCommitImport(preview.id);
  const [failure, setFailure] = useState<ApiError | null>(null);

  const finish = async () => {
    setFailure(null);
    try {
      await commit.mutateAsync({ skipUnresolved: false });
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: meKeys.importOne(uid, preview.id) });
      setFailure(error as ApiError);
    }
  };

  return (
    <View style={styles.root} testID="import-interrupted">
      <SectionCard title="This import was interrupted">
        <Text style={[textStyle('md'), { color: palette.ink }]}>
          {interruptedText(preview.result)}
        </Text>
      </SectionCard>
      {failure && isLimitReached(failure) ? (
        // A card this import was going to add copies to was deleted and its room given away:
        // the rest waits until the plan has room again.
        <LimitReachedNotice
          error={failure}
          title="The rest of this import does not fit your plan"
          testID="import-finish-limit"
        />
      ) : failure ? (
        <FormMessage testID="import-finish-error">{friendlyMessage(failure)}</FormMessage>
      ) : null}
      <Button
        label="Finish the import"
        loadingLabel="Adding to your inventory…"
        icon="tray-arrow-down"
        loading={commit.isPending}
        onPress={() => void finish()}
        testID="import-finish"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  centred: { flexGrow: 1 },
});
