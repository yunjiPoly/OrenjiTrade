import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { FEATURE, useFeatureFlags } from '@/src/api/hooks/featureFlags';
import { useMyLocation } from '@/src/api/hooks/location';
import { useMyProfile } from '@/src/api/hooks/profile';
import type { MyLocationResponse, MyProfileResponse } from '@/src/api/types';
import { useSession } from '@/src/auth/session';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { ChipList, Divider, ListRow, SectionCard } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { gameLabel, languageLabel } from '@/src/lib/profile';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Profile tab: the collector's own profile (what they set up in onboarding), its location and
 * visibility, shortcuts to edit it, to preview it as others see it, and to Settings.
 */
export default function ProfileScreen() {
  const profile = useMyProfile();
  const location = useMyLocation();
  const router = useRouter();
  const session = useSession();
  // Premium, credits and donations follow their flags (web: the account menu).
  const flags = useFeatureFlags();

  return (
    <Screen scroll testID="screen-profile">
      <QueryState
        query={profile}
        errorTitle="We could not load your profile"
        loading={<ProfileSkeleton />}
        testID="profile"
      >
        {(data) => <ProfileContent profile={data} location={location.data} />}
      </QueryState>

      <SectionCard style={styles.section}>
        <ListRow
          icon="tag-outline"
          label="Offers"
          detail="Offers on your cards and the ones you made"
          onPress={() => router.push('/offers')}
          testID="profile-offers"
        />
        <Divider />
        <ListRow
          icon="swap-horizontal-bold"
          label="Trades"
          detail="Deals you agreed on: meet, exchange, confirm"
          onPress={() => router.push('/trades')}
          testID="profile-trades"
        />
        {flags.data?.[FEATURE.premiumPlans] === true ? (
          <>
            <Divider />
            <ListRow
              icon="crown-outline"
              label="Premium"
              detail="Plans, your subscription and your usage"
              onPress={() => router.push('/premium')}
              testID="profile-premium"
            />
          </>
        ) : null}
        {flags.data?.[FEATURE.credits] === true ? (
          <>
            <Divider />
            <ListRow
              icon="hand-coin-outline"
              label="Credits"
              detail="Your balance, unlocks for a day and referrals"
              onPress={() => router.push('/credits')}
              testID="profile-credits"
            />
          </>
        ) : null}
        {flags.data?.[FEATURE.donations] === true ? (
          <>
            <Divider />
            <ListRow
              icon="hand-heart-outline"
              label="Support OrenjiTrade"
              detail="A voluntary donation"
              onPress={() => router.push('/support')}
              testID="profile-support"
            />
          </>
        ) : null}
      </SectionCard>

      <SectionCard style={styles.section}>
        <ListRow
          icon="cog-outline"
          label="Settings"
          onPress={() => router.push('/settings')}
          testID="profile-settings"
        />
        <Divider />
        <ListRow
          icon="map-marker-radius-outline"
          label="Location and discoverability"
          onPress={() => router.push('/settings/location')}
          testID="profile-location"
        />
        <Divider />
        <ListRow
          icon="shield-account-outline"
          label="Privacy"
          onPress={() => router.push('/settings/privacy')}
          testID="profile-privacy"
        />
        <Divider />
        <ListRow
          icon="file-document-outline"
          label="Legal"
          onPress={() => router.push('/legal')}
          testID="profile-legal"
        />
        <Divider />
        <ListRow
          icon="logout"
          label="Sign out"
          kind="button"
          onPress={() => void session.signOut()}
          testID="profile-sign-out"
        />
      </SectionCard>
    </Screen>
  );
}

function ProfileSkeleton() {
  return (
    <View style={styles.header} accessibilityLabel="Loading your profile">
      <Skeleton width={72} height={72} radius={36} />
      <View style={styles.grow}>
        <Skeleton width="60%" height={20} />
        <Skeleton width="40%" height={14} style={styles.gap} />
      </View>
      <SkeletonList rows={2} rowHeight={64} style={styles.full} />
    </View>
  );
}

function ProfileContent({
  profile,
  location,
}: {
  profile: MyProfileResponse;
  location: MyLocationResponse | undefined;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const account = useAccount();
  const place = location?.location;
  const curated = profile.tags.map((tag) => tag.label);

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Avatar src={profile.avatarUrl} name={profile.displayName} size={72} />
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            testID="profile-name"
            style={[textStyle('2xl', 'heading'), styles.name, { color: palette.ink }]}
          >
            {profile.displayName || account.displayName}
          </Text>
          <Text
            testID="profile-handle-label"
            style={[textStyle('md'), { color: palette.textMuted }]}
          >
            @{profile.handle}
          </Text>
        </View>
      </View>
      {profile.bio ? (
        <Text testID="profile-bio-text" style={[textStyle('md'), { color: palette.ink }]}>
          {profile.bio}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Edit profile"
          icon="pencil-outline"
          onPress={() => router.push('/settings/profile')}
          style={styles.grow}
          testID="profile-edit"
        />
        <Button
          label="Public preview"
          icon="eye-outline"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/collectors/[id]', params: { id: profile.handle } })
          }
          style={styles.grow}
          testID="profile-preview"
        />
      </View>

      <SectionCard title="Collects">
        <ChipList
          items={profile.games.map(gameLabel)}
          emptyLabel="No games yet"
          testID="profile-games"
        />
        <Text style={[textStyle('sm'), styles.subtle, { color: palette.textMuted }]}>
          Languages
        </Text>
        <ChipList items={profile.languages.map(languageLabel)} emptyLabel="No languages yet" />
        <Text style={[textStyle('sm'), styles.subtle, { color: palette.textMuted }]}>Tags</Text>
        <ChipList items={curated} emptyLabel="No tags yet" testID="profile-tags" />
      </SectionCard>

      <SectionCard title="Location">
        <Text testID="profile-area" style={[textStyle('md'), { color: palette.ink }]}>
          {place
            ? `${place.city && place.showCity ? `${place.city}, ` : ''}${place.label}`
            : 'No location yet.'}
        </Text>
        <Text testID="profile-visibility" style={[textStyle('sm'), { color: palette.textMuted }]}>
          {location?.discoverable && place
            ? `Visible on the map in ${place.label}.`
            : 'Hidden from the map.'}
        </Text>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing[4] },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[4] },
  name: { fontWeight: fontWeight.bold },
  grow: { flex: 1 },
  full: { width: '100%' },
  gap: { marginTop: spacing[2] },
  actions: { flexDirection: 'row', gap: spacing[2] },
  subtle: { fontWeight: fontWeight.medium },
  section: { marginTop: spacing[4] },
});
