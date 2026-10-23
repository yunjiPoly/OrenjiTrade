import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { useCreateReference } from '@/src/api/hooks/ratings';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { PersonHeader } from '@/src/features/collectors/PersonHeader';
import { REFERENCE_MAX, ratingProblem } from '@/src/features/collectors/ratingLabels';
import { RATING_COPY as COPY } from '@/src/features/ratings/ratingCopy';
import { parseRatingParams } from '@/src/features/ratings/ratingRoutes';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

/**
 * Write a reference (mockup v50 screen 62, stage R14; the web's reference dialog): the collector
 * with "@handle · {province}", what a reference is, a short public recommendation (≤ 400
 * characters, one per collector) after any interaction with them, and "Publish reference" at the
 * bottom. Refusals (403 RATING_NOT_ELIGIBLE, 409 a second reference, banned terms) are explained
 * in place.
 */
export default function WriteReferenceScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const params = useLocalSearchParams<Record<string, string>>();
  const parsed = parseRatingParams(params);
  const create = useCreateReference();
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!parsed) {
    return (
      <SettingsPage title={COPY.referenceTitle} onBack={close} testID="screen-reference">
        <EmptyState
          testID="reference-invalid"
          icon="comment-off-outline"
          title={COPY.referenceInvalidTitle}
          description={COPY.referenceInvalidBody}
          actionLabel={COPY.back}
          onAction={close}
        />
      </SettingsPage>
    );
  }
  const collector = parsed.collector;
  const text = body.trim();
  const error =
    body.length > REFERENCE_MAX
      ? COPY.referenceTooLong(REFERENCE_MAX)
      : touched && !text
        ? COPY.referenceEmpty
        : null;

  const submit = async () => {
    setTouched(true);
    if (!text || body.length > REFERENCE_MAX) {
      return;
    }
    setProblem(null);
    try {
      await create.mutateAsync({
        collector: { id: collector.id, handle: collector.handle },
        body: { body: text },
      });
      snackbar.show(COPY.referencePublished(collector.displayName));
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({ pathname: '/collectors/[id]', params: { id: collector.handle } });
      }
    } catch (failure) {
      setProblem(
        isApiError(failure)
          ? ratingProblem(failure, collector.displayName, 'reference')
          : COPY.referenceFailed
      );
    }
  };

  // A refusal is said in the bar, where the button was pressed.
  const footer = (
    <>
      {problem ? <FormMessage testID="reference-error">{problem}</FormMessage> : null}
      <PillButton
        label={COPY.publishReference}
        loading={create.isPending}
        loadingLabel={COPY.publishing}
        onPress={() => void submit()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="reference-submit"
      />
    </>
  );

  return (
    <SettingsPage
      title={COPY.referenceTitle}
      onBack={close}
      footer={footer}
      testID="screen-reference"
    >
      <PersonHeader
        displayName={collector.displayName}
        handle={collector.handle}
        avatarUrl={collector.avatarUrl}
        testID="reference-person"
      />
      <Text style={[styles.intro, { color: palette.textMuted }]}>
        {COPY.referenceIntro(collector.displayName)}
      </Text>
      <TextField
        label={COPY.reference}
        labelAside={`${body.length} / ${REFERENCE_MAX}`}
        value={body}
        onChangeText={setBody}
        placeholder={COPY.referencePlaceholder}
        multiline
        maxLength={REFERENCE_MAX + 50}
        editable={!create.isPending}
        error={error}
        inputStyle={styles.field}
        textAlignVertical="top"
        testID="reference-body"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 21 },
  field: { minHeight: 120 },
});
