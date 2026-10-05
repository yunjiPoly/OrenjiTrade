import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useCollectorProfile } from '@/src/api/hooks/collectors';
import type { CollectorProfileResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ChipList, SectionCard } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { formatLongDate } from '@/src/lib/dates';
import { distanceBucketLabel } from '@/src/lib/formatDistanceBucket';
import { GENERIC_AREA_LABEL, placeLabel } from '@/src/lib/location';
import { LAST_ACTIVE_LABELS, gameLabel } from '@/src/lib/profile';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * A collector's public profile as the caller sees it (`GET /collectors/{handle}`); for the owner
 * it is the "public preview". Deep link: https://www.orenjitrade.com/collectors/<handle>.
 * Location: the public label and a distance bucket only, never coordinates (ADR 0004).
 */
/** "Near Plateau-Mont-Royal, Montréal", or the generic wording when no place matched. */
function nearLabel(publicLabel: string | null | undefined): string {
  const place = placeLabel(publicLabel);
  return place ? `Near ${place}` : GENERIC_AREA_LABEL;
}

export default function CollectorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useCollectorProfile(id);
  return (
    <Screen scroll safeBottom testID="screen-collector">
      <Stack.Screen options={{ title: id ? `@${id}` : 'Collector' }} />
      <QueryState
        query={profile}
        errorTitle="We could not load this profile"
        loading={<SkeletonList rows={3} rowHeight={64} />}
        testID="collector"
      >
        {(data) => <PublicProfile profile={data} />}
      </QueryState>
    </Screen>
  );
}

function PublicProfile({ profile }: { profile: CollectorProfileResponse }) {
  const { palette } = useTheme();
  const account = useAccount();
  const isMe = account.me?.id === profile.id;
  const distance = distanceBucketLabel(profile.location?.distanceBucket);
  const rating =
    profile.rating.count > 0 && profile.rating.average != null
      ? `★ ${profile.rating.average.toFixed(1)} (${profile.rating.count})`
      : 'No ratings yet';

  return (
    <View style={styles.root}>
      {isMe ? (
        <FormMessage tone="info" testID="public-preview-banner">
          Public preview: this is how other collectors see your profile.
        </FormMessage>
      ) : null}
      <View style={styles.header}>
        <Avatar src={profile.avatarUrl} name={profile.displayName} size={72} decorative={false} />
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            testID="collector-name"
            style={[textStyle('2xl', 'heading'), styles.name, { color: palette.ink }]}
          >
            {profile.displayName}
          </Text>
          <Text style={[textStyle('md'), { color: palette.textMuted }]}>@{profile.handle}</Text>
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            {LAST_ACTIVE_LABELS[profile.lastActiveBucket] ?? ''} · Member since{' '}
            {formatLongDate(profile.memberSince)}
          </Text>
        </View>
      </View>
      {profile.bio ? (
        <Text style={[textStyle('md'), { color: palette.ink }]}>{profile.bio}</Text>
      ) : null}

      <SectionCard title="Collects">
        <ChipList items={profile.games.map(gameLabel)} emptyLabel="No games listed" />
        <ChipList
          items={profile.tags.map((tag) => tag.label)}
          emptyLabel="No tags"
          testID="collector-tags"
        />
      </SectionCard>

      <SectionCard title="Where">
        <Text testID="collector-location" style={[textStyle('md'), { color: palette.ink }]}>
          {profile.location ? nearLabel(profile.location.publicLabel) : 'Not on the map'}
        </Text>
        {distance ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{distance}</Text>
        ) : null}
      </SectionCard>

      <SectionCard title="Reputation">
        <Text style={[textStyle('md'), { color: palette.ink }]}>{rating}</Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {profile.publicBinderCount === 1
            ? '1 public binder'
            : `${profile.publicBinderCount} public binders`}
        </Text>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  grow: { flex: 1, gap: 2 },
  name: { fontWeight: fontWeight.bold },
});
