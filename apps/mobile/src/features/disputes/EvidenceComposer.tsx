import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EvidenceDraft } from '@/src/api/hooks/payments';
import type { PickedImage } from '@/src/api/imageFormData';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Segmented } from '@/src/components/ui/Segmented';
import { TextField } from '@/src/components/ui/TextField';
import {
  DISPUTE_TEXT_MAX,
  evidencePhotoProblem,
  fileSize,
} from '@/src/features/payments/paymentLabels';
import { statementError } from '@/src/features/payments/protectedForms';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

interface PendingPhoto extends PickedImage {
  size: number | null;
}

/** Photo types the API accepts, from what the picker reports. */
function photoType(mimeType: string | null | undefined, fileName: string | null | undefined) {
  if (mimeType) {
    return mimeType.toLowerCase();
  }
  const extension = fileName?.split('.').pop()?.toLowerCase();
  return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * Adds evidence to a dispute from the app (web: `app-evidence-uploader`, within what the API's
 * model allows): a photo from the library (JPEG, PNG or WebP up to 8 MB, previewed before it is
 * added, with an optional caption) or a written statement (TEXT, up to 2000 characters). Says how
 * many more pieces can be added. The camera is not used (card scanning is on hold).
 */
export function EvidenceComposer({
  evidenceLeft,
  busy,
  onAdd,
}: {
  evidenceLeft: number;
  busy: boolean;
  /** Resolves whether the evidence was added (the composer then clears). */
  onAdd: (draft: EvidenceDraft) => Promise<boolean>;
}) {
  const { palette } = useTheme();
  const [mode, setMode] = useState<'photo' | 'statement'>('photo');
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [caption, setCaption] = useState('');
  const [statement, setStatement] = useState('');
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setPhoto(null);
    setCaption('');
    setStatement('');
    setTouched(false);
    setProblem(null);
  };

  const pick = async () => {
    setProblem(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setProblem('Allow access to your photos to add one.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) {
      return;
    }
    const picked: PendingPhoto = {
      uri: asset.uri,
      mimeType: photoType(asset.mimeType, asset.fileName),
      fileName: asset.fileName ?? 'evidence.jpg',
      size: typeof asset.fileSize === 'number' ? asset.fileSize : null,
      file: asset.file ?? null,
    };
    const refusal = evidencePhotoProblem(picked);
    if (refusal) {
      setProblem(refusal);
      return;
    }
    setPhoto(picked);
  };

  const add = async () => {
    setTouched(true);
    if (mode === 'photo') {
      if (!photo || caption.length > DISPUTE_TEXT_MAX) {
        return;
      }
      if (await onAdd({ kind: 'IMAGE', photo, caption })) {
        reset();
      }
      return;
    }
    if (statementError(statement)) {
      return;
    }
    if (await onAdd({ kind: 'TEXT', body: statement })) {
      reset();
    }
  };

  const full = evidenceLeft <= 0;
  return (
    <View style={styles.root} testID="evidence-composer">
      <Segmented<'photo' | 'statement'>
        label="Add evidence"
        options={[
          { value: 'photo', label: 'Photo' },
          { value: 'statement', label: 'Statement' },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setTouched(false);
          setProblem(null);
        }}
        testID="evidence-mode"
      />
      {mode === 'photo' ? (
        photo ? (
          <View style={styles.block} testID="evidence-preview">
            <View style={styles.preview}>
              <Image
                source={{ uri: photo.uri }}
                style={[styles.thumb, { backgroundColor: palette.surfaceVariant }]}
                contentFit="cover"
                accessibilityLabel="Preview of the photo to add"
              />
              <View style={styles.grow}>
                <Text style={[textStyle('sm'), { color: palette.ink }]} numberOfLines={1}>
                  {photo.fileName}
                </Text>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  Photo{photo.size ? ` · ${fileSize(photo.size)}` : ''}
                </Text>
                <Button
                  label="Remove"
                  icon="close"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setPhoto(null)}
                  testID="evidence-remove"
                />
              </View>
            </View>
            <TextField
              label="Caption (optional)"
              value={caption}
              onChangeText={setCaption}
              maxLength={DISPUTE_TEXT_MAX + 50}
              error={
                caption.length > DISPUTE_TEXT_MAX
                  ? `Keep the caption under ${DISPUTE_TEXT_MAX} characters.`
                  : null
              }
              editable={!busy}
              testID="evidence-caption"
            />
          </View>
        ) : (
          <View style={styles.block}>
            <Button
              label="Add a photo"
              icon="image-plus"
              variant="secondary"
              disabled={busy || full}
              onPress={() => void pick()}
              testID="evidence-pick"
            />
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              Photos (JPEG, PNG, WebP) up to 8 MB from your library. You can add {evidenceLeft}{' '}
              more.
            </Text>
          </View>
        )
      ) : (
        <TextField
          label="Your statement"
          value={statement}
          onChangeText={setStatement}
          placeholder="What happened, when, and what you expected."
          multiline
          maxLength={DISPUTE_TEXT_MAX + 50}
          error={touched ? statementError(statement) : null}
          hint={`${statement.length} / ${DISPUTE_TEXT_MAX} · You can add ${evidenceLeft} more.`}
          editable={!busy && !full}
          testID="evidence-statement"
        />
      )}
      {problem ? <FormMessage testID="evidence-problem">{problem}</FormMessage> : null}
      {(mode === 'photo' && photo) || mode === 'statement' ? (
        <Button
          label="Add evidence"
          icon="upload"
          loading={busy}
          loadingLabel="Adding…"
          disabled={full}
          onPress={() => void add()}
          testID="evidence-add"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  block: { gap: spacing[2] },
  preview: { flexDirection: 'row', gap: spacing[3], alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.sm },
  grow: { flex: 1, gap: 2 },
});
