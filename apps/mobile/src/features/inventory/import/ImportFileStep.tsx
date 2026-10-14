import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
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
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { TextField } from '@/src/components/ui/TextField';
import { gamesFrom } from '@/src/lib/profile';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

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
  onUploaded: (preview: InventoryImport) => void;
  onBack: () => void;
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
  onBack,
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
      onUploaded(preview);
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

  return (
    <View style={styles.root} testID={`import-file-${source}`}>
      <View style={styles.block}>
        <Text
          accessibilityRole="header"
          style={[textStyle('lg', 'heading'), styles.heading, { color: palette.ink }]}
        >
          {info.title}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{info.description}</Text>
        {hint ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="import-limits">
            {hint}
          </Text>
        ) : null}
      </View>

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

      <Button
        label="Choose a file"
        icon="file-upload-outline"
        onPress={() => void choose()}
        disabled={busy}
        testID="import-choose-file"
      />
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
            hint="Open the file in another app, copy all of it, and paste it here."
            editable={!busy}
            // A fixed window on the text: a long export scrolls inside it instead of taking the
            // screen (a multiline field otherwise grows with every line).
            inputStyle={styles.paste}
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
          <Button
            label="Use this text"
            icon="content-paste"
            variant="secondary"
            onPress={usePasted}
            disabled={busy}
            testID="import-paste-submit"
          />
        </View>
      ) : (
        <Button
          label="Paste the text of the file"
          icon="content-paste"
          variant="secondary"
          onPress={() => setPasting(true)}
          disabled={busy}
          testID="import-paste"
        />
      )}
      <Button
        label="Another source"
        icon="arrow-left"
        variant="ghost"
        onPress={onBack}
        disabled={upload.isPending}
        style={styles.back}
        testID="import-file-back"
      />

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
  heading: { fontWeight: fontWeight.semibold },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: 12,
    borderWidth: 1,
  },
  grow: { flex: 1 },
  paste: { height: 180 },
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
  },
  back: { alignSelf: 'flex-start' },
});
