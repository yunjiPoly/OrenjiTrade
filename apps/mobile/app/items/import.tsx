import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useCommitImport, useInventoryImport } from '@/src/api/hooks/inventoryImport';
import { useUid } from '@/src/api/hooks/useUid';
import { meKeys } from '@/src/api/queryKeys';
import type { ImportSource, InventoryImport } from '@/src/api/types';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { SettingsGroup } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { IMPORT_COPY } from '@/src/features/inventory/import/importCopy';
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
import { PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

type Step =
  | { name: 'start' }
  | { name: 'file'; source: ImportSource; replaces: InventoryImport | null }
  | { name: 'import'; id: string }
  | { name: 'expired' };

/**
 * "Import cards" (stage S5, opened from Add cards; restyled in stage R14 to mockup v50 screens 66
 * to 68): a Yu-Gi-Oh! deck file (.ydk) or a Collectr CSV export becomes a preview the collector
 * checks and edits, then commits.
 *
 * source → file (choose a file, or paste its text; the other source one row away) → "Check the
 * cards" → "Import done". The preview is kept by the API for a while, so the flow picks up an
 * import that was left open; one that expired says so and starts over. Nothing reaches the
 * inventory before the commit, new cards are private, and a commit sent twice adds nothing twice.
 * Every step has the Settings pages' top bar; the check step draws its own (with the trash), and
 * "Import done" has no back button (its buttons lead on).
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
  // The name of the file this phone sent, by import (memory only): "Check the cards" names it.
  const [fileNames, setFileNames] = useState<Readonly<Record<string, string>>>({});
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
  const uploaded = useCallback(
    (preview: InventoryImport, fileName: string | null) => {
      if (fileName) {
        setFileNames((names) => ({ ...names, [preview.id]: fileName }));
      }
      open(preview.id);
    },
    [open]
  );
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

  // Back from the file step of a source chosen on Add cards: to Add cards.
  const back = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/inventory');
    }
  };
  // "Go to my inventory": the Inventory tab, past Add cards when the import was opened from it.
  const toInventory = () => router.dismissTo('/inventory');

  const page = (
    content: ReactNode,
    onBack: (() => void) | null = back,
    title: string = IMPORT_COPY.title
  ) => (
    <SettingsPage title={title} onBack={onBack} testID="screen-import">
      {content}
    </SettingsPage>
  );

  let body;
  if (step.name === 'start') {
    body = page(
      <ImportStart
        chosen={chosen}
        onSource={chooseSource}
        onContinue={(left) => {
          // The import left open was chosen instead: back at the start, the start shows.
          setChosen(null);
          open(left.id);
        }}
      />
    );
  } else if (step.name === 'file') {
    // Opened on its source from Add cards: back goes back there; otherwise to the start.
    const fileBack = named && !step.replaces ? back : restart;
    body = (
      <SettingsPage
        title={IMPORT_COPY.title}
        onBack={fileBack}
        backTestID="import-file-back"
        testID="screen-import"
      >
        <ImportFileStep
          key={step.source}
          source={step.source}
          replaces={step.replaces}
          onUploaded={uploaded}
          onSwitchSource={(source) => setStep({ name: 'file', source, replaces: step.replaces })}
          onDraft={setDraft}
        />
      </SettingsPage>
    );
  } else if (expired) {
    body = page(
      <EmptyState
        testID="import-expired"
        icon="timer-off-outline"
        title="This preview expired"
        description="A preview is only kept for a while. Nothing was added to your inventory: start again with your file."
        actionLabel="Start over"
        onAction={restart}
      />
    );
  } else if (!preview && current.error) {
    body = page(
      <ErrorState
        testID="import-error"
        error={current.error}
        title="The import could not load"
        onRetry={() => void current.refetch()}
      />
    );
  } else if (!preview) {
    body = page(<SkeletonList rows={4} rowHeight={72} testID="import-loading" />);
  } else if (preview.status === 'COMMITTED') {
    body = page(
      <ImportResult
        preview={preview}
        lateEdits={late}
        onInventory={toInventory}
        onAnother={() => {
          setLate(null);
          setStep({ name: 'file', source: preview.source, replaces: null });
        }}
      />,
      null,
      IMPORT_COPY.doneTitle
    );
  } else if (preview.status === 'COMMITTING') {
    body = page(<ImportInterrupted preview={preview} />);
  } else {
    body = (
      <ImportPreview
        preview={preview}
        fileName={fileNames[preview.id] ?? null}
        onBack={back}
        onGone={expire}
        onDiscarded={restart}
        onLateEdit={lateEdit}
      />
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
      <SettingsGroup title="This import was interrupted">
        <Text style={[textStyle('md'), styles.interrupted, { color: palette.ink }]}>
          {interruptedText(preview.result)}
        </Text>
      </SettingsGroup>
      {failure && isLimitReached(failure) ? (
        // A card this import was going to add copies to was deleted and its room given away:
        // the rest waits until the inventory limit has room again.
        <LimitReachedNotice
          error={failure}
          title="The rest of this import does not fit the inventory limit"
          testID="import-finish-limit"
        />
      ) : failure ? (
        <FormMessage testID="import-finish-error">{friendlyMessage(failure)}</FormMessage>
      ) : null}
      <PillButton
        label="Finish the import"
        loadingLabel="Adding to your inventory…"
        icon="tray-arrow-down"
        loading={commit.isPending}
        onPress={() => void finish()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="import-finish"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  interrupted: { paddingHorizontal: 14, paddingVertical: 12 },
});
