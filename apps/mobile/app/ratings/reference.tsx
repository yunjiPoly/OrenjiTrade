import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { useCreateReference } from '@/src/api/hooks/ratings';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { TextField } from '@/src/components/ui/TextField';
import { REFERENCE_MAX, ratingProblem } from '@/src/features/collectors/ratingLabels';
import { parseRatingParams } from '@/src/features/ratings/ratingRoutes';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Write a reference (the web's reference dialog): a short public recommendation (≤ 400
 * characters, one per collector) after any interaction with them. Refusals (403
 * RATING_NOT_ELIGIBLE, 409 a second reference, banned terms) are explained in place.
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

  if (!parsed) {
    return (
      <Screen testID="screen-reference">
        <EmptyState
          testID="reference-invalid"
          icon="comment-off-outline"
          title="Nothing to write here"
          description="Open the collector's profile and write the reference from there."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }
  const collector = parsed.collector;
  const text = body.trim();
  const error =
    body.length > REFERENCE_MAX
      ? `Keep it under ${REFERENCE_MAX} characters.`
      : touched && !text
        ? 'Write a few words first.'
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
      snackbar.show(`Your reference for ${collector.displayName} is published.`);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({ pathname: '/collectors/[id]', params: { id: collector.handle } });
      }
    } catch (failure) {
      setProblem(
        isApiError(failure)
          ? ratingProblem(failure, collector.displayName, 'reference')
          : 'Your reference could not be published. Please try again.'
      );
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-reference">
      <Stack.Screen options={{ title: 'Write a reference' }} />
      <View style={styles.form}>
        <Text style={[textStyle('md'), { color: palette.ink }]}>
          A reference is a short public recommendation shown on {collector.displayName}&apos;s
          profile. You can write one per collector.
        </Text>
        <TextField
          label="Reference"
          value={body}
          onChangeText={setBody}
          placeholder="What makes them a great collector to trade with?"
          multiline
          maxLength={REFERENCE_MAX + 50}
          editable={!create.isPending}
          error={error}
          hint={`${body.length} / ${REFERENCE_MAX}`}
          testID="reference-body"
        />
        {problem ? <FormMessage testID="reference-error">{problem}</FormMessage> : null}
        <Button
          label="Publish reference"
          loading={create.isPending}
          loadingLabel="Publishing…"
          onPress={() => void submit()}
          testID="reference-submit"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4] },
});
