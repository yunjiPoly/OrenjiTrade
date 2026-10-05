import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { useCollectorRatings } from '@/src/api/hooks/collectors';
import { useCreateRating, useRatingEligibility, useUpdateRating } from '@/src/api/hooks/ratings';
import type {
  RatingEligibilityInteraction,
  RatingResponse,
  UpdateRatingRequest,
} from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, RadioGroup } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { TextField } from '@/src/components/ui/TextField';
import {
  INTERACTION_KIND_ICONS,
  RATING_COMMENT_MAX,
  RATING_CRITERIA,
  RATING_EDIT_DAYS,
  interactionKindLabel,
  rateableInteractions,
  ratingHint,
  ratingProblem,
  type RatingCriterion,
} from '@/src/features/collectors/ratingLabels';
import { parseRatingParams, type RatedCollector } from '@/src/features/ratings/ratingRoutes';
import { StarRatingInput } from '@/src/features/ratings/StarRatingInput';
import { formatLongDate } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

type Scores = Record<RatingCriterion, number | null>;

/**
 * Rate a collector (the web's rate dialog): after a completed trade, an accepted offer or a
 * qualified conversation (`GET /ratings/eligibility`), the interaction to rate when there are
 * several, an overall score (required), the optional criteria the API models (communication,
 * card condition, shipping, meetup reliability) and a comment (≤ 600). `?rating=` edits the
 * caller's own rating within its 14 days. Refusals (403 RATING_NOT_ELIGIBLE, 409 ALREADY_RATED /
 * RATING_EDIT_WINDOW_CLOSED, banned terms) are explained in place.
 */
export default function RateCollectorScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const parsed = parseRatingParams(params);
  const router = useRouter();
  if (!parsed) {
    return (
      <Screen testID="screen-rate">
        <EmptyState
          testID="rate-invalid"
          icon="star-off-outline"
          title="Nothing to rate here"
          description="Open the collector's profile and rate them from there."
          actionLabel="Back"
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }
  return parsed.ratingId ? (
    <EditRating collector={parsed.collector} ratingId={parsed.ratingId} />
  ) : (
    <NewRating collector={parsed.collector} kind={parsed.kind} />
  );
}

function NewRating({
  collector,
  kind,
}: {
  collector: RatedCollector;
  kind: RatingEligibilityInteraction['kind'] | null;
}) {
  const eligibility = useRatingEligibility(collector.id);
  const interactions = useMemo(
    () =>
      rateableInteractions(eligibility.data).filter(
        (interaction) => !kind || interaction.kind === kind
      ),
    [eligibility.data, kind]
  );
  let content;
  if (!eligibility.data) {
    content = eligibility.error ? (
      <ErrorState
        testID="rate-error"
        error={eligibility.error}
        title="We could not check what you can rate"
        onRetry={() => void eligibility.refetch()}
      />
    ) : (
      <View accessibilityLabel="Loading" aria-busy>
        <SkeletonList rows={4} rowHeight={56} testID="rate-loading" />
      </View>
    );
  } else if (interactions.length === 0) {
    content = (
      <EmptyState
        testID="rate-not-eligible"
        icon="star-off-outline"
        title={`You cannot rate ${collector.displayName} now`}
        description={
          ratingHint(eligibility.data, collector.displayName) ??
          `You already rated this interaction with ${collector.displayName}.`
        }
      />
    );
  } else {
    content = <RatingForm collector={collector} interactions={interactions} rating={null} />;
  }
  return (
    <Screen scroll safeBottom testID="screen-rate">
      <Stack.Screen options={{ title: `Rate ${collector.displayName}` }} />
      {content}
    </Screen>
  );
}

function EditRating({ collector, ratingId }: { collector: RatedCollector; ratingId: string }) {
  const ratings = useCollectorRatings(collector.handle);
  const rating =
    ratings.data?.pages.flatMap((page) => page.items).find((item) => item.id === ratingId) ?? null;
  let content;
  if (rating) {
    content = <RatingForm collector={collector} interactions={[]} rating={rating} />;
  } else if (ratings.error) {
    content = (
      <ErrorState
        testID="rate-error"
        error={ratings.error}
        title="Your rating could not load"
        onRetry={() => void ratings.refetch()}
      />
    );
  } else if (ratings.data) {
    content = (
      <EmptyState
        testID="rate-missing"
        icon="star-off-outline"
        title="Open your rating again"
        description={`Edit your rating from ${collector.displayName}'s profile.`}
      />
    );
  } else {
    content = <SkeletonList rows={4} rowHeight={56} testID="rate-loading" />;
  }
  return (
    <Screen scroll safeBottom testID="screen-rate">
      <Stack.Screen options={{ title: 'Edit your rating' }} />
      {content}
    </Screen>
  );
}

function RatingForm({
  collector,
  interactions,
  rating,
}: {
  collector: RatedCollector;
  interactions: readonly RatingEligibilityInteraction[];
  rating: RatingResponse | null;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const create = useCreateRating();
  const update = useUpdateRating();
  const [interactionId, setInteractionId] = useState(interactions[0]?.id ?? '');
  const [overall, setOverall] = useState<number | null>(rating?.overall ?? null);
  const [scores, setScores] = useState<Scores>({
    communication: rating?.breakdown.communication ?? null,
    conditionAccuracy: rating?.breakdown.conditionAccuracy ?? null,
    shipping: rating?.breakdown.shipping ?? null,
    meetupReliability: rating?.breakdown.meetupReliability ?? null,
  });
  const [comment, setComment] = useState(rating?.comment ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;
  const editing = !!rating;
  const interaction = interactions.find((candidate) => candidate.id === interactionId) ?? null;

  const submit = async () => {
    setSubmitted(true);
    if (overall === null || comment.length > RATING_COMMENT_MAX) {
      return;
    }
    if (!editing && !interactionId) {
      setProblem('Choose the interaction you are rating.');
      return;
    }
    const body: UpdateRatingRequest = { overall };
    for (const criterion of RATING_CRITERIA) {
      const score = scores[criterion.key];
      if (score !== null) {
        body[criterion.key] = score;
      }
    }
    const text = comment.trim();
    if (text) {
      body.comment = text;
    }
    setProblem(null);
    const ref = { id: collector.id, handle: collector.handle };
    try {
      if (rating) {
        await update.mutateAsync({ collector: ref, id: rating.id, body });
        snackbar.show('Your rating is updated.');
      } else {
        await create.mutateAsync({ collector: ref, body: { ...body, interactionId } });
        snackbar.show(`Thanks! Your rating of ${collector.displayName} is published.`);
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({ pathname: '/collectors/[id]', params: { id: collector.handle } });
      }
    } catch (error) {
      setProblem(
        isApiError(error)
          ? ratingProblem(error, collector.displayName)
          : 'Your rating could not be saved. Please try again.'
      );
    }
  };

  return (
    <View style={styles.form} testID="rating-form">
      <View style={[styles.who, { backgroundColor: palette.surfaceVariant }]}>
        <Avatar src={collector.avatarUrl} name={collector.displayName} size={40} />
        <View style={styles.grow}>
          <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
            {collector.displayName}
          </Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>@{collector.handle}</Text>
        </View>
      </View>

      {rating ? (
        <InteractionLine
          kind={rating.interactionKind}
          text={`${interactionKindLabel(rating.interactionKind)} · editable until ${formatLongDate(rating.editableUntil)}`}
        />
      ) : interactions.length > 1 ? (
        <RadioGroup
          label="Which interaction are you rating?"
          options={interactions.map((candidate) => ({
            value: candidate.id,
            label: `${interactionKindLabel(candidate.kind)} · ${formatLongDate(candidate.occurredAt)}`,
          }))}
          value={interactionId}
          onChange={setInteractionId}
          disabled={saving}
          testID="rate-interaction"
        />
      ) : interaction ? (
        <InteractionLine
          kind={interaction.kind}
          text={`${interactionKindLabel(interaction.kind)} · ${formatLongDate(interaction.occurredAt)}`}
        />
      ) : null}

      <View style={styles.block}>
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
          Overall <Text style={[textStyle('xs'), { color: palette.textMuted }]}>Required</Text>
        </Text>
        <StarRatingInput
          label="Overall"
          value={overall}
          onChange={setOverall}
          disabled={saving}
          testID="rate-overall"
        />
        {submitted && overall === null ? (
          <Text
            accessibilityRole="alert"
            testID="rate-overall-error"
            style={[textStyle('xs'), { color: palette.danger }]}
          >
            Choose an overall score from 1 to 5 stars.
          </Text>
        ) : null}
      </View>

      <View style={styles.block} accessibilityLabel="Details (optional)">
        <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
          Details <Text style={[textStyle('xs'), { color: palette.textMuted }]}>(optional)</Text>
        </Text>
        {RATING_CRITERIA.map((criterion) => (
          <View key={criterion.key} style={styles.criterion}>
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
              {criterion.label}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{criterion.hint}</Text>
            <StarRatingInput
              label={criterion.label}
              value={scores[criterion.key]}
              onChange={(score) => setScores((current) => ({ ...current, [criterion.key]: score }))}
              clearable
              disabled={saving}
              testID={`rate-${criterion.key}`}
            />
          </View>
        ))}
      </View>

      <TextField
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        placeholder="How did it go? Keep it factual and friendly."
        multiline
        maxLength={RATING_COMMENT_MAX + 50}
        editable={!saving}
        error={
          comment.length > RATING_COMMENT_MAX
            ? `Keep the comment under ${RATING_COMMENT_MAX} characters.`
            : null
        }
        hint={`${comment.length} / ${RATING_COMMENT_MAX}`}
        testID="rate-comment"
      />

      <View style={styles.note}>
        <MaterialCommunityIcons name="earth" size={16} color={palette.textMuted} />
        <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
          Ratings appear on {collector.displayName}&apos;s profile with your name. You can change
          yours during {RATING_EDIT_DAYS} days.
        </Text>
      </View>

      {problem ? <FormMessage testID="rating-error">{problem}</FormMessage> : null}

      <Button
        label={editing ? 'Save changes' : 'Submit rating'}
        loading={saving}
        loadingLabel="Saving…"
        onPress={() => void submit()}
        testID="rate-submit"
      />
    </View>
  );
}

function InteractionLine({ kind, text }: { kind: string; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.interaction} testID="rate-interaction-line">
      <MaterialCommunityIcons
        name={INTERACTION_KIND_ICONS[kind] ?? 'star-outline'}
        size={18}
        color={palette.textMuted}
      />
      <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4] },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  block: { gap: spacing[2] },
  criterion: { gap: 2 },
  interaction: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
