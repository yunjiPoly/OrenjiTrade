import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import type { FriendlyError } from '@/src/api/errorMessages';
import { useImportLimits, useUploadImport } from '@/src/api/hooks/inventoryImport';
import { useGames } from '@/src/api/hooks/profile';
import type { ImportSource, InventoryImport } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { withAlpha } from '@/src/features/account/StatusPage';
import { gamesFrom } from '@/src/lib/profile';
import { fontFamily, fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { IMPORT_COPY } from './importCopy';
import { discardUpload, importFormData, type ImportUpload } from './importFile';
import {
  IMPORT_SOURCES,
  importRefusal,
  limitsHint,
  refusalBeforeUpload,
  utf8Length,
} from './importLabels';
import { pickImportFile } from './pickImportFile';

const ANY_GAME = '__file__';

/** The bar iOS shows over the keyboard of the paste field. */
const PASTE_ACCESSORY = 'import-paste-accessory';

export interface ImportFileStepProps {
  source: ImportSource;
  /** An open preview a new upload replaces: asked before it is thrown away. */
  replaces: InventoryImport | null;
  /** The preview made, and the name of the file this phone sent (null for a pasted text). */
  onUploaded: (preview: InventoryImport, fileName: string | null) => void;
  /** "Collectr CSV export instead" / "Yu-Gi-Oh! deck file instead" (stage R14). */
  onSwitchSource?: (source: ImportSource) => void;
  /** Whether leaving now would lose something typed here (a pasted text) or cut an upload. */
  onDraft: (hasDraft: boolean) => void;
}

/**
 * The file of an import: "Choose a file" (the system file picker) or "Paste the text of the file"
 * (both formats are plain text, and a phone rarely has such a file at hand). Either way the same
 * upload is sent. While it runs a progress line says so; a file the API refuses is explained in
 * words a collector understands (too large, too many lines, not a text file, a column that could
 * not be found, too many imports in a short time), and the collector can try another file.
 */
export function ImportFileStep({
  source,
  replaces,
  onUploaded,
  onSwitchSource,
  onDraft,
}: ImportFileStepProps) {
  const { palette } = useTheme();
  const info = IMPORT_SOURCES[source];
  const limits = useImportLimits();
  const games = useGames();
  const upload = useUploadImport();
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [game, setGame] = useState<string>(ANY_GAME);
  const [refusal, setRefusal] = useState<FriendlyError | null>(null);
  const [picking, setPicking] = useState(false);
  const [waiting, setWaiting] = useState<ImportUpload | null>(null);
  const busy = upload.isPending || picking;
  const hint = limitsHint(source, limits.data);

  const hasDraft = text.trim().length > 0 || upload.isPending;
  useEffect(() => {
    onDraft(hasDraft);
  }, [hasDraft, onDraft]);
  useEffect(() => () => onDraft(false), [onDraft]);

  // A file that waits for "replace your open import?" when the collector leaves the screen: the
  // copy the picker made of it goes with the question.
  const waitingRef = useRef<ImportUpload | null>(null);
  const hold = (what: ImportUpload | null) => {
    waitingRef.current = what;
    setWaiting(what);
  };
  useEffect(() => {
    const held = waitingRef;
    return () => discardUpload(held.current);
  }, []);

  const send = async (what: ImportUpload) => {
    hold(null);
    setRefusal(null);
    let dispose = () => undefined as void;
    try {
      const prepared = await importFormData(source, what);
      dispose = prepared.dispose;
      const preview = await upload.mutateAsync({
        source,
        game: source === 'COLLECTR_CSV' && game !== ANY_GAME ? game : null,
        body: prepared.body,
      });
      setText('');
      onUploaded(preview, what.kind === 'file' ? what.file.name || null : null);
    } catch (error) {
      setRefusal(importRefusal(error as ApiError, source));
    } finally {
      dispose();
    }
  };

  /** Checks what can be checked on the phone, asks before an open preview is replaced, uploads. */
  const start = (what: ImportUpload) => {
    const bytes = what.kind === 'file' ? what.file.size : utf8Length(what.text);
    const early = refusalBeforeUpload(source, bytes, limits.data);
    if (early) {
      // Refused on the phone: the file is not sent, and its copy is not kept.
      discardUpload(what);
      setRefusal(early);
      return;
    }
    if (replaces) {
      hold(what);
      return;
    }
    void send(what);
  };

  const choose = async () => {
    setRefusal(null);
    setPicking(true);
    try {
      const file = await pickImportFile();
      if (file) {
        start({ kind: 'file', file });
      }
    } catch {
      setRefusal({
        title: 'The file could not be opened',
        message: 'Choose the file again, or paste its text instead.',
      });
    } finally {
      setPicking(false);
    }
  };

  const usePasted = () => {
    Keyboard.dismiss();
    if (!text.trim()) {
      setRefusal({
        title: 'Nothing to import yet',
        message: 'Paste the text of the file first.',
      });
      return;
    }
    start({ kind: 'text', text });
  };

  const other: ImportSource = source === 'YDK' ? 'COLLECTR_CSV' : 'YDK';
  const switchTo = IMPORT_COPY.switchTo[other];

  return (
    <View style={styles.root} testID={`import-file-${source}`}>
      <View style={styles.headRow}>
        <View style={[styles.sourceTile, { backgroundColor: palette.primaryContainer }]}>
          <MaterialCommunityIcons
            name={source === 'YDK' ? 'file-outline' : 'file-delimited-outline'}
            size={22}
            color={palette.onPrimaryContainer}
          />
        </View>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={[styles.sourceTitle, { color: palette.ink }]}>
            {info.title}
          </Text>
          <Text style={[styles.sourceLine, { color: palette.textMuted }]}>
            {IMPORT_COPY.sourceLine[source]}
          </Text>
        </View>
      </View>
      <Text style={[styles.intro, { color: palette.textMuted }]}>{IMPORT_COPY.intro}</Text>

      {source === 'COLLECTR_CSV' ? (
        <View style={styles.block}>
          <SelectSheet
            label="Game of the rows that name none"
            options={[
              { value: ANY_GAME, label: 'As the file says' },
              ...gamesFrom(games.data).map((candidate) => ({
                value: candidate.slug,
                label: candidate.label,
              })),
            ]}
            value={game}
            onChange={setGame}
            disabled={busy}
            testID="import-game"
          />
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            Only used for rows of the file that do not say their game.
          </Text>
        </View>
      ) : null}

      {refusal ? (
        <FormMessage
          testID="import-refusal"
          detail={refusal.message}
          detailTestID="import-refusal-detail"
        >
          {refusal.title}
        </FormMessage>
      ) : null}

      {upload.isPending ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Reading your file and matching its cards"
          accessibilityLiveRegion="polite"
          aria-busy
          testID="import-uploading"
          style={[
            styles.progress,
            { borderColor: palette.border, backgroundColor: palette.surface },
          ]}
        >
          <ActivityIndicator color={palette.primary} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
            Reading your file and matching its cards…
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={IMPORT_COPY.chooseFile}
        accessibilityHint={hint ?? undefined}
        aria-disabled={busy}
        disabled={busy}
        onPress={() => void choose()}
        testID="import-choose-file"
        style={({ pressed }) => [
          styles.drop,
          { borderColor: palette.primary, backgroundColor: withAlpha(palette.primary, 0.05) },
          (pressed || busy) && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons name="tray-arrow-up" size={30} color={palette.primary} />
        <Text style={[styles.dropTitle, { color: palette.primary }]}>{IMPORT_COPY.chooseFile}</Text>
        {hint ? (
          <Text style={[styles.dropHint, { color: palette.textMuted }]} testID="import-limits">
            {hint}
          </Text>
        ) : null}
      </Pressable>

      {pasting ? (
        <View style={styles.block}>
          <TextField
            label={info.pasteLabel}
            value={text}
            onChangeText={(next) => {
              setText(next);
              setRefusal(null);
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            smartInsertDelete={false}
            hint={IMPORT_COPY.pasteHint}
            editable={!busy}
            // A fixed window on the text: a long export scrolls inside it instead of taking the
            // screen (a multiline field otherwise grows with every line).
            inputStyle={[styles.paste, { fontFamily: fontFamily.mono }]}
            scrollEnabled
            textAlignVertical="top"
            inputAccessoryViewID={Platform.OS === 'ios' ? PASTE_ACCESSORY : undefined}
            testID="import-paste-text"
          />
          {Platform.OS === 'ios' ? (
            // A field of several lines has no key that puts the keyboard away, and the keyboard
            // covers the button under the field: "Done" over the keyboard does.
            <InputAccessoryView nativeID={PASTE_ACCESSORY}>
              <View
                style={[
                  styles.accessory,
                  { backgroundColor: palette.surfaceVariant, borderTopColor: palette.border },
                ]}
              >
                <Button
                  label="Done"
                  variant="ghost"
                  onPress={() => Keyboard.dismiss()}
                  accessibilityLabel="Done: hide the keyboard"
                  testID="import-paste-done"
                />
              </View>
            </InputAccessoryView>
          ) : null}
          <PillButton
            label={IMPORT_COPY.useText}
            onPress={usePasted}
            disabled={busy}
            testID="import-paste-submit"
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setPasting(true)}
          testID="import-paste"
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={[styles.linkText, { color: palette.accent }]}>
            {IMPORT_COPY.pasteInstead}
          </Text>
        </Pressable>
      )}

      {onSwitchSource ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={switchTo.title}
          accessibilityHint={switchTo.line}
          disabled={upload.isPending}
          onPress={() => onSwitchSource(other)}
          testID="import-switch-source"
          style={({ pressed }) => [
            styles.switchRow,
            { backgroundColor: palette.surface, borderColor: palette.border },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.switchTile, { backgroundColor: palette.accentContainer }]}>
            <MaterialCommunityIcons
              name={other === 'YDK' ? 'file-outline' : 'file-delimited-outline'}
              size={18}
              color={palette.onAccentContainer}
            />
          </View>
          <View style={styles.grow}>
            <Text style={[styles.switchTitle, { color: palette.ink }]}>{switchTo.title}</Text>
            <Text style={[styles.switchLine, { color: palette.textMuted }]}>{switchTo.line}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textDisabled} />
        </Pressable>
      ) : null}

      <ConfirmDialog
        visible={waiting !== null}
        title="Replace your open import?"
        message="You have an import you did not finish. A new file replaces it: the choices you made for it are lost. Nothing of it was added to your inventory."
        confirmLabel="Replace it"
        cancelLabel="Keep it"
        onConfirm={() => {
          if (waiting) {
            void send(waiting);
          }
        }}
        onCancel={() => {
          // "Keep it": the new file is dropped, and so is the copy the picker made of it.
          discardUpload(waiting);
          hold(null);
        }}
        testID="import-replace-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  block: { gap: spacing[2] },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTitle: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.semibold },
  sourceLine: { fontSize: 13, lineHeight: 18 },
  intro: { fontSize: 14, lineHeight: 21 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: 12,
    borderWidth: 1,
  },
  grow: { flex: 1, minWidth: 0 },
  drop: {
    minHeight: 168,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  dropTitle: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.bold, textAlign: 'center' },
  dropHint: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  paste: { height: 140, fontSize: 13 },
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
  },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold, textAlign: 'center' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  switchTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  switchLine: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.75 },
});
