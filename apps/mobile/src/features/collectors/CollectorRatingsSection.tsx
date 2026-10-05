import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCollectorRatings, useCollectorReferences } from '@/src/api/hooks/collectors';
import type { CollectorProfileResponse, RatingResponse, ReferenceResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { breakdownRows, formatAverage, ratingCountLabel, stars } from './ratingLabels';

/**
 * "Ratings & references" of a profile (the web's ratings section, read only on mobile for now:
 * rating a collector and writing a reference arrive with the mobile Phase 7 stage): the summary
 * with its breakdown, the ratings ("Show more ratings") and the references ("Show more
 * references"), each with loading, empty and error-with-retry states.
 */
export function CollectorRatingsSection({
  profile,
  isOwn,
}: {
  profile: CollectorProfileResponse;
  isOwn: boolean;
}) {
  const { palette } = useTheme();
  const ratings = useCollectorRatings(profile.handle);
  const references = useCollectorReferences(profile.handle);
  const pages = ratings.data?.pages ?? [];
  const summary = pages[0]?.summary ?? null;
  const items = pages.flatMap((page) => page.items);
  const refs = references.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  const who = isOwn ? 'you' : profile.displayName;

  return (
    <SectionCard title="Ratings & references" testID="collector-ratings">
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        From collectors who traded, made a deal or had a real conversation with {who}.
      </Text>
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
              {items.map((rating) => (
                <RatingRow key={rating.id} rating={rating} />
              ))}
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

      <Text
        accessibilityRole="header"
        style={[textStyle('md'), styles.strong, { color: palette.ink }]}
      >
        References
      </Text>
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

function RatingRow({ rating }: { rating: RatingResponse }) {
  const { palette } = useTheme();
  return (
    <View style={styles.row} testID={`rating-${rating.id}`}>
      <Avatar src={rating.rater.avatarUrl} name={rating.rater.displayName} size={32} />
      <View style={styles.grow}>
        <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
          {rating.rater.displayName}
          <Text style={{ color: palette.textMuted }}> · {relativeTime(rating.createdAt)}</Text>
        </Text>
        <Text
          accessibilityLabel={`${rating.overall} out of 5`}
          style={[textStyle('sm'), { color: palette.primary }]}
        >
          {stars(rating.overall)}
        </Text>
        {rating.comment ? (
          <Text style={[textStyle('sm'), { color: palette.ink }]}>{rating.comment}</Text>
        ) : null}
      </View>
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
});
