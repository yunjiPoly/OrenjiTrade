import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useDiscardImport, useMyImports } from '@/src/api/hooks/inventoryImport';
import type { ImportSource, InventoryImport } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  IMPORT_SOURCES,
  IMPORT_SOURCE_ORDER,
  interruptedText,
  isExpired,
  openImportText,
} from './importLabels';

export interface ImportStartProps {
  /** A source was chosen; `open` is the preview a new upload would replace, if any. */
  onSource: (source: ImportSource, open: InventoryImport | null) => void;
  /** The collector continues the import they left (a preview, or a commit that was cut). */
  onContinue: (preview: InventoryImport) => void;
  /**
   * The source chosen before this screen ("Import a deck" or "Import from Collectr" on Add cards,
   * stage R2): with no import left open the file step follows at once; with one, this screen
   * shows it first so it can be continued or replaced.
   */
  chosen?: ImportSource | null;
}

/** The import the collector left open: a preview still usable, or a commit to finish. */
export function openImport(
  imports: readonly InventoryImport[] | undefined,
  now: number = Date.now()
): InventoryImport | null {
  return (
    imports?.find(
      (candidate) =>
        candidate.status === 'COMMITTING' ||
        (candidate.status === 'PENDING' && !isExpired(candidate, now))
    ) ?? null
  );
}

/**
 * The first screen of the import: the import the collector left open, if any (a preview is kept
 * on the server for a while, so closing the app loses nothing), and the two sources with one
 * sentence each on what the file is and how to get it out of the other app.
 */
export function ImportStart({ onSource, onContinue, chosen = null }: ImportStartProps) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const imports = useMyImports();
  const discard = useDiscardImport();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Decided once, on the first list: an import left open is shown first, and stays the choice
  // after it is continued or discarded.
  const decided = useRef(false);
  const loaded = !!imports.data;
  const nothingOpen = loaded && !openImport(imports.data ?? []);

  useEffect(() => {
    if (decided.current || !loaded) {
      return;
    }
    decided.current = true;
    if (chosen && nothingOpen) {
      onSource(chosen, null);
    }
  }, [chosen, loaded, nothingOpen, onSource]);

  if (!imports.data && imports.error) {
    return (
      <ErrorState
        testID="import-start-error"
        error={imports.error}
        title="The import could not open"
        onRetry={() => void imports.refetch()}
      />
    );
  }
  if (!imports.data) {
    return <SkeletonList rows={3} rowHeight={96} testID="import-start-loading" />;
  }

  const open = openImport(imports.data);
  const interrupted = open?.status === 'COMMITTING';

  const discardOpen = async () => {
    if (!open) {
      return;
    }
    try {
      await discard.mutateAsync(open.id);
      snackbar.show('Import discarded. Nothing was added.');
    } catch (error) {
      const apiError = error as ApiError;
      // Already gone (expired, purged): nothing left to discard.
      if (apiError.errorCode !== 'NOT_FOUND' && apiError.errorCode !== 'IMPORT_EXPIRED') {
        snackbar.show(friendlyMessage(apiError), { tone: 'error' });
      }
    } finally {
      setConfirmDiscard(false);
      void imports.refetch();
    }
  };

  return (
    <View style={styles.root} testID="import-start">
      <Text style={[textStyle('md'), { color: palette.ink }]}>
        Bring cards from a file into your inventory. You see every card and choose what goes in
        before anything is added.
      </Text>

      {open ? (
        <SectionCard
          title={interrupted ? 'Finish your import' : 'Continue your import'}
          description={interrupted ? interruptedText(open.result) : openImportText(open)}
          testID="import-open"
        >
          {interrupted ? (
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
              {openImportText(open)}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label={interrupted ? 'Finish the import' : 'Continue'}
              onPress={() => onContinue(open)}
              style={styles.grow}
              testID="import-open-continue"
            />
            {interrupted ? null : (
              <Button
                label="Discard"
                variant="ghost"
                onPress={() => setConfirmDiscard(true)}
                testID="import-open-discard"
              />
            )}
          </View>
        </SectionCard>
      ) : null}

      <Text
        accessibilityRole="header"
        style={[textStyle('lg', 'heading'), styles.heading, { color: palette.ink }]}
      >
        {open ? 'Or start a new import' : 'Where do your cards come from?'}
      </Text>
      {IMPORT_SOURCE_ORDER.map((source) => {
        const info = IMPORT_SOURCES[source];
        return (
          <Pressable
            key={source}
            accessibilityRole="button"
            accessibilityLabel={info.title}
            accessibilityHint={info.description}
            onPress={() => onSource(source, open?.status === 'PENDING' ? open : null)}
            testID={`import-source-${source}`}
            style={({ pressed }) => [
              styles.source,
              { backgroundColor: palette.surface, borderColor: palette.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.icon, { backgroundColor: palette.primaryContainer }]}>
              <MaterialCommunityIcons
                name={info.icon}
                size={24}
                color={palette.onPrimaryContainer}
              />
            </View>
            <View style={styles.grow}>
              <Text style={[textStyle('md'), styles.heading, { color: palette.ink }]}>
                {info.title}
              </Text>
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                {info.description}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textDisabled} />
          </Pressable>
        );
      })}

      <ConfirmDialog
        visible={confirmDiscard}
        title="Discard this import?"
        message="The choices you made for it are lost. Nothing was added to your inventory."
        confirmLabel="Discard"
        cancelLabel="Keep it"
        tone="danger"
        busy={discard.isPending}
        onConfirm={() => void discardOpen()}
        onCancel={() => setConfirmDiscard(false)}
        testID="import-discard-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  heading: { fontWeight: fontWeight.semibold },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
});
