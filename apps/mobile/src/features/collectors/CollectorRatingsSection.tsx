import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useCollectorRatings, useCollectorReferences } from '@/src/api/hooks/collectors';
import { useRatingEligibility } from '@/src/api/hooks/ratings';
import type { CollectorProfileResponse, RatingResponse, ReferenceResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { ratingParams } from '@/src/features/ratings/ratingRoutes';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  INTERACTION_KIND_ICONS,
  breakdownEntries,
  breakdownRows,
  canWriteReference,
  formatAverage,
  interactionKindLabel,
  isRatingEditable,
  rateableInteractions,
  ratingCountLabel,
  ratingHint,
  stars,
} from './ratingLabels';

/**
 * "Ratings & references" of a profile (the web's ratings section): the summary with its
 * breakdown, the ratings ("Show more ratings", the caller's own one editable for 14 days) and the
 * references ("Show more references"), each with loading, empty and error-with-retry states. A
 * visitor can rate the collector after an eligible interaction (`GET /ratings/eligibility`),
 * write one reference after any interaction, or reads why not.
 */
export function CollectorRatingsSection({
  profile,
  isOwn,
}: {
  profile: CollectorProfileResponse;
  isOwn: boolean;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const myHandle = useAccount().handle;
  const ratings = useCollectorRatings(profile.handle);
  const references = useCollectorReferences(profile.handle);
  const eligibility = useRatingEligibility(profile.id, !isOwn);
  const pages = ratings.data?.pages ?? [];
  const summary = pages[0]?.summary ?? null;
  const items = pages.flatMap((page) => page.items);
  const refs = references.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const who = isOwn ? 'you' : profile.displayName;
  const canRate = !isOwn && rateableInteractions(eligibility.data).length > 0;
  const wroteReference = !!myHandle && refs.some((ref) => ref.author.handle === myHandle);
  const canReference =
    !isOwn && canWriteReference(eligibility.data) && !!references.data && !wroteReference;
  const hint = !isOwn ? ratingHint(eligibility.data, profile.displayName) : null;
  const collector = { id: profile.id, handle: profile.handle, displayName: profile.displayName };

  return (
    <SectionCard title="Ratings & references" testID="collector-ratings">
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        From collectors who traded, made a deal or had a real conversation with {who}.
      </Text>
      {canRate ? (
        <Button
          label="Rate this collector"
          icon="star-outline"
          onPress={() =>
            router.push({ pathname: '/ratings/rate', params: ratingParams(collector) })
          }
          testID="collector-rate"
        />
      ) : null}
      {ratings.data ? (
        <>
          <View style={styles.summary} testID="rating-summary">
            <Text style={[textStyle('3xl', 'heading'), styles.strong, { color: palette.ink }]}>
              {formatAverage(summary?.average ?? profile.rating.average)}
            </Text>
            <View>
              <Text
                accessibilityLabel={`Average ${formatAverage(summary?.average)} out of 5`}
                style={[textStyle('md'), { color: palette.primary }]}
              >
                {stars(summary?.average)}
              </Text>
              <Text testID="rating-count" style={[textStyle('sm'), { color: palette.textMuted }]}>
                {ratingCountLabel(summary?.count ?? profile.rating.count)}
              </Text>
            </View>
          </View>
          <View style={styles.breakdown} accessibilityLabel="Rating breakdown">
            {breakdownRows(summary).map((row) => (
              <View key={row.key} style={styles.breakdownRow}>
                <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>
                  {row.label}
                </Text>
                <Text style={[textStyle('sm'), { color: palette.ink }]}>{row.text}</Text>
              </View>
            ))}
          </View>
          {items.length === 0 ? (
            <Text testID="ratings-empty" style={[textStyle('sm'), { color: palette.textMuted }]}>
              {isOwn
                ? 'No ratings yet. Collectors can rate you after a completed trade, an accepted offer or a real conversation.'
                : 'No ratings yet. Ratings appear after completed trades, accepted offers or real conversations.'}
            </Text>
          ) : (
            <View style={styles.list}>
              {items.map((rating) => {
                const mine = !!myHandle && rating.rater.handle === myHandle;
                return (
                  <RatingRow
                    key={rating.id}
                    rating={rating}
                    mine={mine}
                    onEdit={
                      mine && isRatingEditable(rating)
                        ? () =>
                            router.push({
                              pathname: '/ratings/rate',
                              params: ratingParams(collector, { ratingId: rating.id }),
                            })
                        : undefined
                    }
                  />
                );
              })}
            </View>
          )}
          {ratings.hasNextPage ? (
            <Button
              label="Show more ratings"
              variant="ghost"
              loading={ratings.isFetchingNextPage}
              loadingLabel="Loading…"
              onPress={() => void ratings.fetchNextPage()}
              testID="ratings-more"
            />
          ) : null}
          {hint ? (
            <View style={styles.inline} testID="rating-hint">
              <MaterialCommunityIcons name="information-outline" size={18} color={palette.info} />
              <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>
                {hint}
              </Text>
            </View>
          ) : null}
        </>
      ) : ratings.error ? (
        <ErrorState
          compact
          testID="ratings-error"
          error={ratings.error}
          title="Ratings could not load"
          onRetry={() => void ratings.refetch()}
        />
      ) : (
        <SkeletonList rows={2} rowHeight={48} testID="ratings-loading" />
      )}

      <View style={styles.refsHead}>
        <Text
          accessibilityRole="header"
          style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}
        >
          References
        </Text>
        {canReference ? (
          <Button
            label="Write a reference"
            icon="comment-quote-outline"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/ratings/reference', params: ratingParams(collector) })
            }
            testID="collector-write-reference"
          />
        ) : null}
      </View>
      {references.data ? (
        refs.length === 0 ? (
          <Text testID="references-empty" style={[textStyle('sm'), { color: palette.textMuted }]}>
            No references yet.
          </Text>
        ) : (
          <View style={styles.list}>
            {refs.map((reference) => (
              <ReferenceRow key={reference.id} reference={reference} />
            ))}
            {references.hasNextPage ? (
              <Button
                label="Show more references"
                variant="ghost"
                loading={references.isFetchingNextPage}
                loadingLabel="Loading…"
                onPress={() => void references.fetchNextPage()}
                testID="references-more"
              />
            ) : null}
          </View>
        )
      ) : references.error ? (
        <View style={styles.inline} testID="references-error">
          <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>
            References could not load.
          </Text>
          <Button label="Retry" variant="ghost" onPress={() => void references.refetch()} />
        </View>
      ) : (
        <SkeletonList rows={1} rowHeight={48} testID="references-loading" />
      )}
    </SectionCard>
  );
}

function RatingRow({
  rating,
  mine,
  onEdit,
}: {
  rating: RatingResponse;
  mine: boolean;
  onEdit?: () => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const criteria = breakdownEntries(rating.breakdown);
  return (
    <View style={styles.row} testID={`rating-${rating.id}`}>
      <Avatar src={rating.rater.avatarUrl} name={rating.rater.displayName} size={32} />
      <View style={styles.grow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Rating by ${rating.rater.displayName}. Opens their profile.`}
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: rating.rater.handle } })
          }
        >
          <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
            {rating.rater.displayName}
            {mine ? <Text style={{ color: palette.primary }}> · You</Text> : null}
            <Text style={{ color: palette.textMuted }}>
              {' '}
              · {relativeTime(rating.createdAt)}
              {rating.updatedAt !== rating.createdAt ? ' · edited' : ''}
            </Text>
          </Text>
        </Pressable>
        <View style={styles.inline}>
          <Text
            accessibilityLabel={`${rating.overall} out of 5`}
            style={[textStyle('sm'), { color: palette.primary }]}
          >
            {stars(rating.overall)}
          </Text>
          <MaterialCommunityIcons
            name={INTERACTION_KIND_ICONS[rating.interactionKind] ?? 'star-outline'}
            size={14}
            color={palette.textMuted}
          />
          <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
            {interactionKindLabel(rating.interactionKind)}
          </Text>
        </View>
        {rating.comment ? (
          <Text style={[textStyle('sm'), { color: palette.ink }]}>{rating.comment}</Text>
        ) : null}
        {criteria.length > 0 ? (
          <Text
            testID={`rating-criteria-${rating.id}`}
            style={[textStyle('xs'), { color: palette.textMuted }]}
          >
            {criteria.map((entry) => `${entry.label} ${entry.value}★`).join(' · ')}
          </Text>
        ) : null}
      </View>
      {onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit your rating"
          onPress={onEdit}
          hitSlop={8}
          testID={`rating-edit-${rating.id}`}
          style={({ pressed }) => [
            styles.edit,
            { borderColor: palette.border },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="pencil-outline" size={16} color={palette.accent} />
          <Text style={[textStyle('xs'), styles.strong, { color: palette.accent }]}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReferenceRow({ reference }: { reference: ReferenceResponse }) {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.row} testID={`reference-${reference.id}`}>
      <Avatar src={reference.author.avatarUrl} name={reference.author.displayName} size={32} />
      <View style={styles.grow}>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: reference.author.handle } })
          }
        >
          <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
            {reference.author.displayName}
            <Text style={{ color: palette.textMuted }}> · {relativeTime(reference.createdAt)}</Text>
          </Text>
        </Pressable>
        <Text style={[textStyle('sm'), styles.italic, { color: palette.ink }]}>
          “{reference.body}”
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: fontWeight.semibold },
  italic: { fontStyle: 'italic' },
  grow: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  breakdown: { gap: spacing[1] },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  list: { gap: spacing[3] },
  row: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  refsHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  pressed: { opacity: 0.8 },
});
