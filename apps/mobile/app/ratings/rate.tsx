import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { useCollectorRatings } from '@/src/api/hooks/collectors';
import { useCreateRating, useRatingEligibility, useUpdateRating } from '@/src/api/hooks/ratings';
import type {
  RatingEligibilityInteraction,
  RatingResponse,
  UpdateRatingRequest,
} from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { PersonHeader } from '@/src/features/collectors/PersonHeader';
import {
  RATING_COMMENT_MAX,
  RATING_CRITERIA,
  RATING_EDIT_DAYS,
  rateableInteractions,
  ratingHint,
  ratingProblem,
  type RatingCriterion,
} from '@/src/features/collectors/ratingLabels';
import { RATING_COPY as COPY, dealLine, editLine } from '@/src/features/ratings/ratingCopy';
import {
  parseRatingParams,
  ratingParams,
  type RatedCollector,
} from '@/src/features/ratings/ratingRoutes';
import { StarRatingInput } from '@/src/features/ratings/StarRatingInput';
import { GroupTitle, SettingsRadios } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { PINNED_MAX_FONT_SCALE, fontWeight, useTheme } from '@/src/theme';

type Scores = Record<RatingCriterion, number | null>;

/**
 * Rate a collector (mockup v50 screen 61, stage R14; the web's rate dialog), opened from the sold
 * note of a chat (`?kind=SALE`; the sale notification opens that chat) or a profile's ratings.
 * After an eligible interaction (a sale, a qualified conversation, or an old trade or accepted
 * offer; `GET /ratings/eligibility`): the collector and the deal ("{card} · sold to you {date}"),
 * the deal to rate when there are several, Overall with 34 pt stars and its word (required),
 * the details (Communication, Card condition, Shipping; never meetup reliability: deals ship by
 * mail, ADR 0018) with clearable stars, a comment (≤ 600), where it appears, "Write a reference
 * instead" and "Publish rating". `?rating=` edits the caller's own rating within its 14 days.
 * Refusals (403 RATING_NOT_ELIGIBLE, 409 ALREADY_RATED / RATING_EDIT_WINDOW_CLOSED, banned terms)
 * are explained in place.
 */
export default function RateCollectorScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const parsed = parseRatingParams(params);
  const router = useRouter();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!parsed) {
    return (
      <SettingsPage title={COPY.invalidTitle} onBack={close} testID="screen-rate">
        <EmptyState
          testID="rate-invalid"
          icon="star-off-outline"
          title={COPY.invalidTitle}
          description={COPY.invalidBody}
          actionLabel={COPY.back}
          onAction={close}
        />
      </SettingsPage>
    );
  }
  return parsed.ratingId ? (
    <EditRating collector={parsed.collector} ratingId={parsed.ratingId} onBack={close} />
  ) : (
    <NewRating collector={parsed.collector} kind={parsed.kind} onBack={close} />
  );
}

function NewRating({
  collector,
  kind,
  onBack,
}: {
  collector: RatedCollector;
  kind: RatingEligibilityInteraction['kind'] | null;
  onBack: () => void;
}) {
  const eligibility = useRatingEligibility(collector.id);
  const interactions = useMemo(
    () =>
      rateableInteractions(eligibility.data).filter(
        (interaction) => !kind || interaction.kind === kind
      ),
    [eligibility.data, kind]
  );
  const title = COPY.title(collector.displayName);
  if (eligibility.data && interactions.length > 0) {
    return (
      <RatingForm
        title={title}
        collector={collector}
        interactions={interactions}
        rating={null}
        onBack={onBack}
      />
    );
  }
  let content;
  if (!eligibility.data) {
    content = eligibility.error ? (
      <ErrorState
        testID="rate-error"
        error={eligibility.error}
        title={COPY.checkFailed}
        onRetry={() => void eligibility.refetch()}
      />
    ) : (
      <View accessibilityLabel="Loading" aria-busy>
        <SkeletonList rows={4} rowHeight={56} testID="rate-loading" />
      </View>
    );
  } else {
    content = (
      <EmptyState
        testID="rate-not-eligible"
        icon="star-off-outline"
        title={COPY.cannotRate(collector.displayName)}
        description={
          ratingHint(eligibility.data, collector.displayName) ??
          COPY.alreadyRated(collector.displayName)
        }
      />
    );
  }
  return (
    <SettingsPage title={title} onBack={onBack} testID="screen-rate">
      {content}
    </SettingsPage>
  );
}

function EditRating({
  collector,
  ratingId,
  onBack,
}: {
  collector: RatedCollector;
  ratingId: string;
  onBack: () => void;
}) {
  const ratings = useCollectorRatings(collector.handle);
  const rating =
    ratings.data?.pages.flatMap((page) => page.items).find((item) => item.id === ratingId) ?? null;
  if (rating) {
    return (
      <RatingForm
        title={COPY.editTitle}
        collector={collector}
        interactions={[]}
        rating={rating}
        onBack={onBack}
      />
    );
  }
  let content;
  if (ratings.error) {
    content = (
      <ErrorState
        testID="rate-error"
        error={ratings.error}
        title={COPY.loadFailed}
        onRetry={() => void ratings.refetch()}
      />
    );
  } else if (ratings.data) {
    content = (
      <EmptyState
        testID="rate-missing"
        icon="star-off-outline"
        title={COPY.missingTitle}
        description={COPY.missingBody(collector.displayName)}
      />
    );
  } else {
    content = <SkeletonList rows={4} rowHeight={56} testID="rate-loading" />;
  }
  return (
    <SettingsPage title={COPY.editTitle} onBack={onBack} testID="screen-rate">
      {content}
    </SettingsPage>
  );
}

function RatingForm({
  title,
  collector,
  interactions,
  rating,
  onBack,
}: {
  title: string;
  collector: RatedCollector;
  interactions: readonly RatingEligibilityInteraction[];
  rating: RatingResponse | null;
  onBack: () => void;
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
  });
  const [comment, setComment] = useState(rating?.comment ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;
  const editing = !!rating;
  const interaction = interactions.find((candidate) => candidate.id === interactionId) ?? null;
  const tooLong = comment.length > RATING_COMMENT_MAX;
  const ready = overall !== null && !tooLong && (editing || !!interactionId);

  const submit = async () => {
    if (overall === null || !ready) {
      return;
    }
    const body: UpdateRatingRequest = { overall };
    for (const criterion of RATING_CRITERIA) {
      const score = scores[criterion.key];
      if (score !== null) {
        body[criterion.key] = score;
      }
    }
    // The phone no longer asks it, but an edit keeps an old rating's meetup score (the API column
    // stays for the paused web).
    const meetupScore = rating?.breakdown.meetupReliability;
    if (typeof meetupScore === 'number') {
      body.meetupReliability = meetupScore;
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
        snackbar.show(COPY.updated);
      } else {
        await create.mutateAsync({ collector: ref, body: { ...body, interactionId } });
        snackbar.show(COPY.published(collector.displayName));
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({ pathname: '/collectors/[id]', params: { id: collector.handle } });
      }
    } catch (error) {
      setProblem(isApiError(error) ? ratingProblem(error, collector.displayName) : COPY.saveFailed);
    }
  };

  const line = rating
    ? editLine(rating.interactionKind, rating.editableUntil)
    : interaction
      ? dealLine(interaction)
      : null;

  const footer = (
    <>
      <PillButton
        label={editing ? COPY.save : COPY.publish}
        loading={saving}
        loadingLabel={COPY.saving}
        disabled={!ready || saving}
        onPress={() => void submit()}
        accessibilityHint={overall === null ? COPY.chooseOverall : undefined}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="rate-submit"
      />
      {overall === null ? (
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.why, { color: palette.textMuted }]}
          testID="rate-overall-error"
        >
          {COPY.chooseOverall}
        </Text>
      ) : null}
    </>
  );

  return (
    <SettingsPage title={title} onBack={onBack} footer={footer} testID="screen-rate">
      <View testID="rating-form" style={styles.form}>
        <PersonHeader
          displayName={collector.displayName}
          handle={collector.handle}
          avatarUrl={collector.avatarUrl}
          line={line}
          testID="rate-person"
        />

        {!rating && interactions.length > 1 ? (
          <SettingsRadios
            title={COPY.whichInteraction}
            options={interactions.map((candidate) => ({
              value: candidate.id,
              label: dealLine(candidate),
            }))}
            value={interactionId}
            onChange={setInteractionId}
            disabled={saving}
            testID="rate-interaction"
          />
        ) : null}

        <View
          style={[
            styles.overall,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="rate-overall-card"
        >
          <Text accessibilityRole="header" style={[styles.overallTitle, { color: palette.ink }]}>
            {COPY.overall}
          </Text>
          <StarRatingInput
            label={COPY.overallLabel}
            value={overall}
            onChange={setOverall}
            size="large"
            disabled={saving}
            testID="rate-overall"
          />
        </View>

        <View style={styles.group}>
          <GroupTitle>{COPY.details}</GroupTitle>
          <View
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            {RATING_CRITERIA.map((criterion, index) => (
              <View
                key={criterion.key}
                style={[
                  styles.criterion,
                  index > 0 && { borderTopWidth: 1, borderTopColor: palette.border },
                ]}
                testID={`rate-row-${criterion.key}`}
              >
                <View style={styles.words}>
                  <Text style={[styles.criterionLabel, { color: palette.ink }]}>
                    {criterion.label}
                  </Text>
                  <Text style={[styles.criterionHint, { color: palette.textMuted }]}>
                    {criterion.hint}
                  </Text>
                </View>
                <StarRatingInput
                  label={criterion.label}
                  value={scores[criterion.key]}
                  onChange={(score) =>
                    setScores((current) => ({ ...current, [criterion.key]: score }))
                  }
                  clearable
                  disabled={saving}
                  testID={`rate-${criterion.key}`}
                />
              </View>
            ))}
          </View>
        </View>

        <TextField
          label={COPY.comment}
          labelAside={COPY.commentCount(comment.length, RATING_COMMENT_MAX)}
          value={comment}
          onChangeText={setComment}
          placeholder={COPY.commentPlaceholder}
          multiline
          maxLength={RATING_COMMENT_MAX + 50}
          editable={!saving}
          error={tooLong ? COPY.commentTooLong(RATING_COMMENT_MAX) : null}
          inputStyle={styles.comment}
          textAlignVertical="top"
          testID="rate-comment"
        />

        <Text style={[styles.note, { color: palette.textMuted }]} testID="rate-note">
          {COPY.appears(collector.handle, RATING_EDIT_DAYS)}
        </Text>

        {!editing ? (
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              router.replace({ pathname: '/ratings/reference', params: ratingParams(collector) })
            }
            hitSlop={4}
            testID="rate-reference-instead"
            style={({ pressed }) => [styles.link, pressed && styles.pressed]}
          >
            <Text style={[styles.linkText, { color: palette.accent }]}>
              {COPY.referenceInstead}
            </Text>
          </Pressable>
        ) : null}

        {problem ? <FormMessage testID="rating-error">{problem}</FormMessage> : null}
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  overall: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 16,
    paddingBottom: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  overallTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  group: { gap: 0 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  criterion: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 8,
  },
  words: { flex: 1, minWidth: 140, gap: 2 },
  criterionLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium },
  criterionHint: { fontSize: 12, lineHeight: 16 },
  comment: { height: 80 },
  note: { fontSize: 12, lineHeight: 17 },
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: fontWeight.semibold },
  why: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
