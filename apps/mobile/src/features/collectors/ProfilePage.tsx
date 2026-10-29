import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  useCollectorBinders,
  useCollectorPublicItems,
  useCollectorReferences,
} from '@/src/api/hooks/collectors';
import { useCollectorWishlist } from '@/src/api/hooks/collectorWishlist';
import { usePrivacySettings } from '@/src/api/hooks/location';
import { useWishlist } from '@/src/api/hooks/wishlist';
import type { CollectorProfileResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { useMessageCollector } from '@/src/features/messages/useMessageCollector';
import { spacing, useStackedRows, useTheme } from '@/src/theme';

import { ProfileHeader } from './ProfileHeader';
import { PROFILE_COPY } from './profileCopy';
import { ownUnseenReason } from './profileRules';
import {
  AboutSection,
  BindersSection,
  CardsSection,
  RatingsSection,
  SectionHeader,
  SectionNote,
  WishRow,
  wishRowFromOwn,
  wishRowFromSummary,
  type WishRowEntry,
} from './ProfileSections';
import { useIHaveIt } from './useIHaveIt';

/** Wishes shown on the page; "See all" has the rest. */
export const PROFILE_WISHES_SHOWN = 3;

export interface ProfilePageProps {
  profile: CollectorProfileResponse;
  /** Your own page (the Profile tab, or your profile opened from a link). */
  own: boolean;
  /** The header's star: scroll to "Ratings & references". */
  onJumpToRatings: () => void;
  /** Where "Ratings & references" starts in the page (to scroll there). */
  onRatingsLayout?: (y: number) => void;
  /** Where the header's main button ends (the compact top bar shows once it scrolls away). */
  onActionsLayout?: (bottom: number) => void;
  /** Share profile (the share sheet of the system). */
  onShare: () => void;
  /** Another collector you blocked: the header, and Unblock instead of the sections. */
  blockedByMe?: boolean;
  onUnblock?: () => void;
  unblocking?: boolean;
}

/**
 * A collector's profile page (owner spec 2026-10-14, section 9; mockup screens 19 to 21): the
 * header, one orange "Message {handle}" (another collector) or "Edit profile" and "Share profile"
 * (yours), then Cards, Binders, Looking for, About, and Ratings & references, each with "See all".
 * The same page others see: only public cards and binders, the wishes only while their owner shows
 * them; yours have no "I have it" and "See all" leads to your Inventory, Inventory › Binders and
 * Search › Wishlist. No location section.
 */
export function ProfilePage({
  profile,
  own,
  onJumpToRatings,
  onRatingsLayout,
  onActionsLayout,
  onShare,
  blockedByMe = false,
  onUnblock,
  unblocking = false,
}: ProfilePageProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const stacked = useStackedRows();
  const listed = !profile.isBlocked;
  const items = useCollectorPublicItems(profile.handle, listed);
  const binders = useCollectorBinders(profile.handle, listed);
  const references = useCollectorReferences(profile.handle);
  const theirWishes = useCollectorWishlist(profile.handle, listed && !own);
  const myWishes = useWishlist(own);
  const privacy = usePrivacySettings(own);
  const { message, startingId } = useMessageCollector();
  const { haveIt, busyKey } = useIHaveIt();

  const openCollector = (handle: string) =>
    router.push({ pathname: '/collectors/[id]', params: { id: handle } });

  const actions = own ? (
    <View style={[styles.ownActions, stacked && styles.ownActionsStacked]}>
      <Button
        label={PROFILE_COPY.editProfile}
        icon="pencil-outline"
        variant="secondary"
        onPress={() => router.push('/settings/profile')}
        style={!stacked && styles.half}
        testID="profile-edit"
      />
      <Button
        label={PROFILE_COPY.shareProfile}
        icon="export-variant"
        variant="secondary"
        onPress={onShare}
        style={!stacked && styles.half}
        testID="profile-share"
      />
    </View>
  ) : blockedByMe ? (
    <View style={styles.blocked} testID="collector-blocked">
      <Text style={[styles.blockedText, { color: palette.textMuted }]}>
        {PROFILE_COPY.blockedByMe(profile.handle)}
      </Text>
      <Button
        label={PROFILE_COPY.unblockAction}
        icon="lock-open-variant-outline"
        variant="secondary"
        loading={unblocking}
        accessibilityLabel={PROFILE_COPY.unblock(profile.handle)}
        onPress={onUnblock}
        testID="collector-unblock"
      />
    </View>
  ) : (
    <View style={styles.message}>
      <Button
        label={PROFILE_COPY.message(profile.handle)}
        handleInLabel
        icon="message-text-outline"
        loading={startingId === profile.id}
        loadingLabel={PROFILE_COPY.opening}
        disabled={!profile.canMessage}
        accessibilityHint={PROFILE_COPY.messageHint(profile.handle)}
        onPress={() => void message(profile.id)}
        testID="collector-message"
      />
      {!profile.canMessage ? (
        <Text
          testID="collector-message-reason"
          style={[styles.blockedText, { color: palette.textMuted }]}
        >
          {PROFILE_COPY.noMessages(profile.handle)}
        </Text>
      ) : null}
    </View>
  );

  const head = (
    <View style={styles.head}>
      <ProfileHeader
        profile={profile}
        own={own}
        onRating={onJumpToRatings}
        onLocation={() => router.push('/settings/location')}
      />
      <View
        testID="profile-actions"
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          onActionsLayout?.(y + height);
        }}
      >
        {actions}
      </View>
    </View>
  );

  if (!own && profile.isBlocked) {
    return <View style={styles.root}>{head}</View>;
  }

  // Looking for: another collector's public wishes, or yours (with their ids, to edit them).
  let wishRows: WishRowEntry[] = [];
  let wishesReady = false;
  let wishesFailed = false;
  if (own) {
    wishesReady = !!myWishes.data;
    wishesFailed = !!myWishes.error && !myWishes.data;
    wishRows = (myWishes.data ?? []).flatMap((item) => wishRowFromOwn(item) ?? []);
  } else {
    wishesReady = !!theirWishes.data;
    wishesFailed = !!theirWishes.error && !theirWishes.data;
    wishRows = (theirWishes.data ?? []).flatMap(
      (entry, index) => wishRowFromSummary(entry, index) ?? []
    );
  }
  const hiddenFromOthers = own && privacy.data?.wishlistVisible === false && wishRows.length > 0;
  // Your page while others see none of your cards and binders (not on the map, or private): the
  // empty sections say so and link to the setting, not to "Make cards public".
  const unseen = own ? ownUnseenReason(privacy.data) : null;
  const onUnseen = () =>
    router.push(unseen === 'private' ? '/settings/privacy' : '/settings/location');
  const refs = references.data?.pages.flatMap((page) => page.items ?? []);

  return (
    <View style={styles.root}>
      {head}
      <CardsSection
        items={items}
        own={own}
        unseen={unseen}
        onUnseen={onUnseen}
        onOpen={(item) =>
          own
            ? router.push({ pathname: '/items/[id]', params: { id: item.id } })
            : router.push({
                pathname: '/cards/[id]',
                params: { id: item.card.id, printing: item.printing.id },
              })
        }
        onSeeAll={() =>
          own
            ? router.navigate({ pathname: '/inventory', params: { view: 'cards' } })
            : router.push({ pathname: '/collectors/[id]/cards', params: { id: profile.handle } })
        }
      />
      <BindersSection
        binders={binders}
        own={own}
        unseen={unseen}
        onUnseen={onUnseen}
        onOpen={(binder) =>
          own
            ? router.push({ pathname: '/binders/edit', params: { id: binder.id } })
            : router.push({ pathname: '/binders/[id]', params: { id: binder.id } })
        }
        onSeeAll={() =>
          own
            ? router.navigate({ pathname: '/inventory', params: { view: 'binders' } })
            : router.push({
                pathname: '/collectors/[id]/binders',
                params: { id: profile.handle },
              })
        }
      />
      <View style={styles.section} testID="profile-wishes">
        <SectionHeader
          title={PROFILE_COPY.lookingFor}
          seeAllLabel={PROFILE_COPY.seeAllWishes}
          onSeeAll={
            own
              ? () => router.navigate({ pathname: '/search', params: { segment: 'wishlist' } })
              : wishRows.length > 0
                ? () =>
                    router.push({
                      pathname: '/collectors/[id]/wishes',
                      params: { id: profile.handle },
                    })
                : undefined
          }
          testID="profile-wishes"
        />
        {wishesReady ? (
          wishRows.length === 0 ? (
            <SectionNote
              text={own ? PROFILE_COPY.emptyWishes.own : PROFILE_COPY.emptyWishes.other}
              testID="profile-wishes-empty"
            />
          ) : (
            <View style={styles.wishes}>
              {wishRows.slice(0, PROFILE_WISHES_SHOWN).map((entry) => (
                <WishRow
                  key={entry.key}
                  entry={entry}
                  own={own}
                  handle={profile.handle}
                  busy={busyKey === entry.key}
                  canHave={!own && profile.canMessage}
                  onHave={() =>
                    void haveIt(
                      profile.id,
                      {
                        cardId: entry.cardId,
                        cardName: entry.cardName,
                        printing: entry.printing,
                        rarity: entry.rarity,
                      },
                      entry.key
                    )
                  }
                  onEdit={() =>
                    entry.wishId
                      ? router.push({ pathname: '/wishlist/edit', params: { id: entry.wishId } })
                      : undefined
                  }
                />
              ))}
            </View>
          )
        ) : wishesFailed ? (
          <SectionNote
            text={PROFILE_COPY.sectionError(PROFILE_COPY.lookingFor)}
            onRetry={() => void (own ? myWishes.refetch() : theirWishes.refetch())}
            testID="profile-wishes-error"
          />
        ) : (
          <View
            style={styles.wishes}
            testID="profile-wishes-loading"
            accessibilityLabel={PROFILE_COPY.loading}
            aria-busy
          >
            <Skeleton height={64} radius={14} />
            <Skeleton height={64} radius={14} />
          </View>
        )}
        {hiddenFromOthers ? (
          <SectionNote text={PROFILE_COPY.hiddenWishes} testID="profile-wishes-hidden" />
        ) : null}
      </View>
      <AboutSection
        bio={profile.bio}
        empty={own ? PROFILE_COPY.emptyBio.own : PROFILE_COPY.emptyBio.other(profile.displayName)}
      />
      <View onLayout={(event) => onRatingsLayout?.(event.nativeEvent.layout.y)}>
        <RatingsSection
          average={profile.rating.average ?? null}
          count={profile.rating.count}
          references={{
            data: refs,
            error: references.error,
            refetch: () => void references.refetch(),
          }}
          onSeeAll={() =>
            router.push({ pathname: '/collectors/[id]/references', params: { id: profile.handle } })
          }
          onAuthor={openCollector}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 18, paddingTop: 4, paddingBottom: spacing[6] },
  head: { gap: 10, paddingHorizontal: spacing[4], paddingTop: 4 },
  ownActions: { flexDirection: 'row', gap: spacing[2] },
  ownActionsStacked: { flexDirection: 'column' },
  half: { flex: 1 },
  message: { gap: spacing[1] },
  blocked: { gap: spacing[2] },
  blockedText: { fontSize: 13, lineHeight: 18 },
  section: { gap: 10 },
  wishes: { gap: spacing[2], paddingHorizontal: spacing[4] },
});
