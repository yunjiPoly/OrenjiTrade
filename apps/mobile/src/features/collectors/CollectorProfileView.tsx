import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCollectorBinders, useCollectorPublicItems } from '@/src/api/hooks/collectors';
import type { CollectorProfileResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { ChipList, SectionCard } from '@/src/components/ui/Layout';
import { SponsoredSlot } from '@/src/features/ads/SponsoredSlot';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { reportParams } from '@/src/features/reports/reportLabels';
import { approximateAreaSentence } from '@/src/lib/approximateArea';
import { formatLongDate } from '@/src/lib/dates';
import { distanceBucketLabel } from '@/src/lib/formatDistanceBucket';
import { GENERIC_AREA_LABEL, placeLabel } from '@/src/lib/location';
import { LAST_ACTIVE_LABELS, gameLabel } from '@/src/lib/profile';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { ApproximateAreaMap } from './ApproximateAreaMap';
import { CollectorRatingsSection } from './CollectorRatingsSection';
import { PublicBindersSection, PublicCardsSection } from './CollectorListings';
import { CollectorWishlistSection } from './CollectorWishlistSection';
import { MessageAction } from './MessageAction';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** "Near Plateau-Mont-Royal, Montréal", or the generic wording when no place matched. */
export function nearLabel(publicLabel: string | null | undefined): string {
  const place = placeLabel(publicLabel);
  return place ? `Near ${place}` : GENERIC_AREA_LABEL;
}

/**
 * A collector's public profile as the viewer sees it (the web's `collector-profile-view` +
 * ratings section): header with place, distance bucket, member since and last activity; actions
 * (own profile: edit and privacy; others: the first public binder, Message when allowed and
 * Report); about, games and tags; the approximate area (a 3 km zone, never a point); ratings and
 * references (rate, write a reference); public binders and cards ("Make an offer"); the public
 * wishlist ("Looking for") when the collector shows it.
 */
export function CollectorProfileView({
  profile,
  isOwn,
  onRatingsLayout,
}: {
  profile: CollectorProfileResponse;
  isOwn: boolean;
  /** Where the ratings section starts (y in this view), to scroll there (`?tab=ratings`). */
  onRatingsLayout?: (y: number) => void;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const binders = useCollectorBinders(profile.handle);
  const items = useCollectorPublicItems(profile.handle);
  const { message, startingId } = useMessageCollector();
  const distance = distanceBucketLabel(profile.location?.distanceBucket);
  const lastActive =
    profile.lastActiveBucket !== 'HIDDEN' ? LAST_ACTIVE_LABELS[profile.lastActiveBucket] : null;
  const firstBinder = binders.data?.[0] ?? null;
  const place = placeLabel(profile.location?.publicLabel);

  return (
    <View style={styles.root}>
      {isOwn ? (
        <FormMessage tone="info" testID="public-preview-banner">
          Public preview: this is how other collectors see your profile.
        </FormMessage>
      ) : null}

      <View style={styles.header}>
        <View>
          <Avatar src={profile.avatarUrl} name={profile.displayName} size={72} decorative={false} />
          {profile.onlineStatus === 'ONLINE' ? (
            <View
              accessibilityRole="image"
              accessibilityLabel="Online now"
              style={[styles.online, { backgroundColor: palette.online.online }]}
            />
          ) : null}
        </View>
        <View style={styles.grow}>
          <Text
            accessibilityRole="header"
            testID="collector-name"
            style={[textStyle('2xl', 'heading'), styles.strong, { color: palette.ink }]}
          >
            {profile.displayName}
          </Text>
          <Text style={[textStyle('md'), { color: palette.textMuted }]}>@{profile.handle}</Text>
        </View>
      </View>

      <View style={styles.facts} accessibilityLabel="Collector details">
        <Fact
          icon={profile.location ? 'map-marker-radius-outline' : 'map-marker-off-outline'}
          text={profile.location ? nearLabel(profile.location.publicLabel) : 'Not on the map'}
          testID="collector-location"
        />
        {distance ? <Fact icon="near-me" text={distance} testID="collector-distance" /> : null}
        <Fact
          icon="calendar-month-outline"
          text={`Member since ${formatLongDate(profile.memberSince)}`}
        />
        {lastActive ? (
          <Fact icon="clock-outline" text={lastActive} testID="collector-last-active" />
        ) : null}
      </View>

      <View style={styles.actions}>
        {isOwn ? (
          <>
            <Button
              label="Edit profile"
              icon="pencil-outline"
              onPress={() => router.push('/settings/profile')}
              testID="collector-edit-profile"
            />
            <Button
              label="Privacy"
              icon="shield-account-outline"
              variant="secondary"
              onPress={() => router.push('/settings/privacy')}
            />
          </>
        ) : (
          <>
            <Button
              label="View public binder"
              icon="book-open-variant"
              disabled={!firstBinder}
              accessibilityHint={
                firstBinder
                  ? undefined
                  : binders.data
                    ? 'No public binder yet'
                    : 'Loading public binders…'
              }
              onPress={() =>
                firstBinder
                  ? router.push({ pathname: '/binders/[id]', params: { id: firstBinder.id } })
                  : undefined
              }
              testID="collector-view-binder"
            />
            <MessageAction
              displayName={profile.displayName}
              canMessage={profile.canMessage}
              isBlocked={profile.isBlocked}
              starting={startingId === profile.id}
              onMessage={() => void message(profile.id)}
              testID="collector-message"
            />
            <Button
              label="Report"
              icon="flag-outline"
              variant="ghost"
              accessibilityLabel={`Report ${profile.displayName}`}
              onPress={() =>
                router.push({
                  pathname: '/report',
                  params: reportParams(profile, { source: 'PROFILE' }),
                })
              }
              testID="collector-report"
            />
          </>
        )}
      </View>

      <SectionCard title="About" testID="collector-about">
        <Text style={[textStyle('md'), { color: profile.bio ? palette.ink : palette.textMuted }]}>
          {profile.bio || `${profile.displayName} has not written a bio yet.`}
        </Text>
        <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>Games</Text>
        <ChipList items={profile.games.map(gameLabel)} emptyLabel="No games listed." />
        <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>Tags</Text>
        <ChipList
          items={profile.tags.map((tag) => tag.label)}
          emptyLabel="No tags yet."
          testID="collector-tags"
        />
      </SectionCard>

      <SectionCard title="Trading area" testID="collector-area-section">
        {profile.location ? (
          <>
            <ApproximateAreaMap
              point={profile.location.publicPoint}
              label={`Approximate area of ${profile.displayName}, about 3 km wide${place ? `, around ${place}` : ''}`}
            />
            <View style={styles.note}>
              <MaterialCommunityIcons
                name="shield-account-outline"
                size={18}
                color={palette.accent}
              />
              <Text
                testID="collector-area-note"
                style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}
              >
                {approximateAreaSentence(place)}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.note}>
            <Text
              testID="collector-area-hidden"
              style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}
            >
              {isOwn ? 'You are' : `${profile.displayName} is`} not visible on the map.
            </Text>
            {isOwn ? (
              <Button
                label="Location settings"
                variant="ghost"
                onPress={() => router.push('/settings/location')}
              />
            ) : null}
          </View>
        )}
      </SectionCard>

      <View onLayout={(event) => onRatingsLayout?.(event.nativeEvent.layout.y)}>
        <CollectorRatingsSection profile={profile} isOwn={isOwn} />
      </View>
      <PublicBindersSection profile={profile} isOwn={isOwn} binders={binders} />
      <PublicCardsSection items={items} profile={profile} />
      <CollectorWishlistSection
        handle={profile.handle}
        displayName={profile.displayName}
        isOwn={isOwn}
      />
      {!isOwn ? <SponsoredSlot placement="COLLECTOR_PROFILE" /> : null}
    </View>
  );
}

function Fact({ icon, text, testID }: { icon: IconName; text: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact}>
      <MaterialCommunityIcons name={icon} size={18} color={palette.textMuted} />
      <Text testID={testID} style={[textStyle('md'), styles.grow, { color: palette.ink }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  facts: { gap: spacing[1] },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  actions: { gap: spacing[2] },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  online: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
