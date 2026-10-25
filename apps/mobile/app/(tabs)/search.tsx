import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsGuest } from '@/src/api/hooks/useUid';
import { useWishlist } from '@/src/api/hooks/wishlist';
import { Text } from '@/src/components/ui/Text';
import { UnderlineTabs } from '@/src/components/ui/UnderlineTabs';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { GamePill } from '@/src/features/games/GamePill';
import { GuestPage } from '@/src/features/guest/GuestParts';
import { PersonButton } from '@/src/features/guest/PersonButton';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { placeCodeFrom } from '@/src/features/map/places';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';
import { BindersSegment } from '@/src/features/search/BindersSegment';
import { CardTyping } from '@/src/features/search/CardTyping';
import { SearchMap } from '@/src/features/search/SearchMap';
import { SEARCH_COPY } from '@/src/features/search/searchCopy';
import {
  SEARCH_SEGMENTS,
  segmentLabel,
  segmentOfLink,
  type SearchSegment,
} from '@/src/features/search/searchSegments';
import { WishlistSegment } from '@/src/features/search/WishlistSegment';
import { isRegionCode } from '@/src/lib/place';
import { TITLE_MAX_FONT_SCALE, fontFamily, fontWeight, spacing, useTheme } from '@/src/theme';

type SearchParams = {
  segment?: string;
  /** The `?tab=` of the links before stage R5. */
  tab?: string;
  /** Opens the card search with this text. */
  q?: string;
  game?: string;
  /** `1`: opens the card search with the keyboard up (Home's field, stage R7). */
  typing?: string;
  /**
   * A set's code: the card search shows that set's cards (a set page's "Who has cards of this
   * set", stage R14), named by `setName`.
   */
  set?: string;
  setName?: string;
  /** A region to browse (the old Map tab's links). */
  region?: string;
  /** A state or province to show on the map (the old Map tab's links). */
  subdivision?: string;
  /**
   * The state or province of the Binders segment. Not `state`: React Navigation reads a `state`
   * parameter as a navigator's own state, and a link from a screen of the root stack hands its
   * parameters to the tabs too (the tabs crashed, stage R5 review P1).
   */
  place?: string;
};

/** The state a link names, on the region it names (or the browsed one), once per link. */
export interface LinkedPlace {
  region: string | null;
  code: string;
  nonce: number;
}

const SET_CODE = /^[\w.-]{1,32}$/;

/** The set a link names (`?set=` and `?setName=`), or null. */
function setOfLink(params: SearchParams): { code: string; name: string } | null {
  const code = typeof params.set === 'string' ? params.set.trim() : '';
  if (!SET_CODE.test(code)) {
    return null;
  }
  const name = typeof params.setName === 'string' ? params.setName.trim().slice(0, 120) : '';
  return { code, name };
}

function linkedPlaceOf(params: SearchParams, nonce: number): LinkedPlace | null {
  const code = placeCodeFrom(params.subdivision);
  if (!code) {
    return null;
  }
  const region =
    typeof params.region === 'string' && isRegionCode(params.region) ? params.region : null;
  return { region, code, nonce };
}

const LINK_KEYS: readonly (keyof SearchParams)[] = [
  'segment',
  'tab',
  'q',
  'game',
  'typing',
  'set',
  'setName',
  'region',
  'subdivision',
  'place',
];

/**
 * Search (owner spec 2026-10-14, sections 4 and 8; mockup screens 11 to 15): the title "Search"
 * with the game pill and the bell, then the segments Cards | Binders | Wishlist (Wishlist with the
 * number of wishes). Every segment shows the browsed game (stage G, one game at a time). Cards
 * opens on the region map (the old Map tab) and turns into the card search while a card is typed;
 * Binders lists the binders and deck cores of the region or of the state the map chose; Wishlist
 * is the old Wishlist tab. No Filters button and no counts beyond the map's and the number of
 * wishes.
 *
 * Links: `?segment=cards|binders|wishlist` (and the old `?tab=`), `?q=` and `?typing=1` (the card
 * search), `?game=` (browses that game when it can be browsed), `?region=` and `?subdivision=`
 * (the old Map tab: the region browsed, the state shown), `?segment=binders&place=` (the old
 * public binders of a state). A link is used up once followed: its parameters are cleared, so the
 * same link opens the same place every time it is tapped.
 */
export default function SearchScreen() {
  const params = useLocalSearchParams<SearchParams>();
  const navigation = useNavigation<{ setParams: (params: Partial<SearchParams>) => void }>();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const { select, knows, ready } = useBrowsingRegion();
  const browsing = useBrowsingGame();
  const wishlist = useWishlist();
  // Signed out (stage R15): the person button for the bell, Wishlist asks to sign in in place.
  const guest = useIsGuest();
  const [segment, setSegment] = useState<SearchSegment>(() => segmentOfLink(params) ?? 'cards');
  const [typing, setTyping] = useState<{ text: string } | null>(() =>
    params.q || params.typing === '1' || setOfLink(params) ? { text: params.q ?? '' } : null
  );
  const [cardSet, setCardSet] = useState<{ code: string; name: string } | null>(() =>
    setOfLink(params)
  );
  const [state, setState] = useState<string | null>(() => placeCodeFrom(params.place));
  // The state a link names, on the region it names (applied once per link: `nonce`).
  const [linkCount, setLinkCount] = useState(0);
  const [linkedPlace, setLinkedPlace] = useState<LinkedPlace | null>(() =>
    linkedPlaceOf(params, 0)
  );

  // A new link into the tab: its segment, text, region and place, once (then its parameters go).
  const link = LINK_KEYS.map((key) => params[key] ?? '').join('|');
  const [followed, setFollowed] = useState(link);
  if (link !== followed) {
    setFollowed(link);
    if (link.replace(/\|/g, '') !== '') {
      const linkedSegment = segmentOfLink(params);
      const linkedSet = setOfLink(params);
      setCardSet(linkedSet);
      if (params.q || params.typing === '1' || linkedSet) {
        setSegment('cards');
        setTyping({ text: params.q ?? '' });
      } else if (linkedSegment) {
        setSegment(linkedSegment);
        if (linkedSegment === 'cards') {
          setTyping(null);
        }
      }
      if (params.place !== undefined) {
        setState(placeCodeFrom(params.place));
      }
      const place = linkedPlaceOf(params, linkCount + 1);
      setLinkCount(linkCount + 1);
      if (place) {
        setSegment('cards');
        setTyping(null);
        setLinkedPlace(place);
      }
    }
  }
  const linkedRegion = typeof params.region === 'string' ? params.region : undefined;
  const linkedGame = typeof params.game === 'string' ? params.game : undefined;
  const selectGame = browsing.select;
  useEffect(() => {
    if (!ready || link.replace(/\|/g, '') === '') {
      return;
    }
    if (linkedRegion && isRegionCode(linkedRegion) && knows(linkedRegion)) {
      select(linkedRegion);
    }
    // A link that names a game browses it (stage G), when it can be browsed.
    if (linkedGame) {
      selectGame(linkedGame);
    }
    const cleared: Partial<SearchParams> = {};
    for (const key of LINK_KEYS) {
      cleared[key] = undefined;
    }
    navigation.setParams(cleared);
  }, [knows, link, linkedGame, linkedRegion, navigation, ready, select, selectGame]);

  // Search › Wishlist shows the browsed game's wishes (stage G), and so does its count.
  const wishes = wishlist.data
    ? wishlist.data.filter((wish) => wish.game === browsing.game).length
    : null;
  const tabs = SEARCH_SEGMENTS.map((value) => ({
    value,
    label: segmentLabel(value),
    count: value === 'wishlist' ? wishes : undefined,
  }));

  let body;
  if (segment === 'binders') {
    body = (
      <BindersSegment
        state={state}
        onClearState={() => setState(null)}
        onPickOnMap={() => {
          setTyping(null);
          setSegment('cards');
        }}
      />
    );
  } else if (segment === 'wishlist') {
    // A guest's Wishlist asks to sign in in place (stage R15, mockup v50 screen 72).
    body = guest ? <GuestPage kind="wishlist" testID="guest-wishlist" /> : <WishlistSegment />;
  } else if (typing) {
    body = (
      <CardTyping
        initialText={typing.text}
        onCancel={() => {
          setTyping(null);
          setCardSet(null);
        }}
        set={cardSet}
        onClearSet={() => setCardSet(null)}
      />
    );
  } else {
    body = (
      <SearchMap
        onType={() => setTyping({ text: '' })}
        onSeeBinders={(code) => {
          setState(code);
          setSegment('binders');
        }}
        linkedPlace={linkedPlace}
      />
    );
  }

  return (
    <View
      key={`text-size-${fontScale}`}
      testID="screen-search"
      style={[styles.fill, { backgroundColor: palette.background, paddingTop: insets.top }]}
    >
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <View style={styles.titleGroup}>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[styles.title, { color: palette.ink }]}
              testID="search-title"
            >
              {SEARCH_COPY.title}
            </Text>
            <GamePill testID="search-game" />
          </View>
          {guest ? (
            <PersonButton testID="person-button-search" />
          ) : (
            <NotificationBell testID="notification-bell-search" variant="round" />
          )}
        </View>
        <UnderlineTabs<SearchSegment>
          label={SEARCH_COPY.segmentsLabel}
          tabs={tabs}
          value={segment}
          onChange={(next) => {
            setSegment(next);
            if (next === 'cards') {
              setTyping(null);
              setCardSet(null);
            }
          }}
          testID="search-segment"
        />
      </View>
      <View style={styles.body}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[3],
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  body: { flex: 1, paddingHorizontal: spacing[4], paddingTop: spacing[3] },
});
