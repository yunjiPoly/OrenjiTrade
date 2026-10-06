import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { recordAdImpression, useAds } from '@/src/api/hooks/billing';
import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import type { Ad, AdPlacement } from '@/src/api/types';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { adClickUrl, adImageUrl } from './adLinks';

/** Why an ad is shown (web: the "Sponsored" label's tooltip). */
export const SPONSORED_HINT =
  'Sponsored placements match games and your approximate region, never your exact location.';

/**
 * One sponsored placement (web: `app-sponsored-ad`): always labelled "Sponsored", "Remove ads"
 * (to Premium) while premium plans are sold, the advertiser, the headline, the text and the call
 * to action. The impression is recorded once the ad is laid out on screen; a tap opens the API's
 * click route (it records the click once and redirects to the landing page) in the browser.
 */
export function SponsoredAd({
  ad,
  href,
  image,
  variant,
  removeAdsLink,
}: {
  ad: Ad;
  href: string;
  image: string | null;
  variant: 'card' | 'compact';
  removeAdsLink: boolean;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const seen = useRef(false);
  return (
    <View
      testID="sponsored-ad"
      accessibilityLabel={`Sponsored: ${ad.headline ?? ''}`}
      onLayout={(event) => {
        if (!seen.current && event.nativeEvent.layout.height > 0) {
          seen.current = true;
          recordAdImpression(ad);
        }
      }}
      style={[styles.ad, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <View style={styles.top}>
        <Text
          testID="sponsored-label"
          accessibilityHint={SPONSORED_HINT}
          style={[
            textStyle('xs'),
            styles.label,
            { color: palette.textMuted, borderColor: palette.borderStrong },
          ]}
        >
          {ad.label || 'Sponsored'}
        </Text>
        {removeAdsLink ? (
          <Text
            accessibilityRole="link"
            onPress={() => router.push('/premium')}
            style={[textStyle('xs'), styles.remove, { color: palette.accent }]}
            testID="sponsored-remove-ads"
          >
            Remove ads
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${ad.headline ?? ''}${ad.advertiser ? `, ${ad.advertiser}` : ''} (sponsored, opens in the browser)`}
        onPress={() => void Linking.openURL(href)}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        testID="sponsored-link"
      >
        {image ? (
          <Image
            source={{ uri: image }}
            style={variant === 'compact' ? styles.imageSmall : styles.image}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View style={styles.body}>
          {ad.advertiser ? (
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{ad.advertiser}</Text>
          ) : null}
          <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
            {ad.headline}
          </Text>
          {ad.body && variant !== 'compact' ? (
            <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{ad.body}</Text>
          ) : null}
          {ad.ctaLabel ? (
            <View style={styles.cta}>
              <Text style={[textStyle('sm'), styles.strong, { color: palette.accent }]}>
                {ad.ctaLabel}
              </Text>
              <MaterialCommunityIcons name="open-in-new" size={14} color={palette.accent} />
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/** The ads of a slot that can be shown: a creative, a headline and a safe click route. */
export function shownAds(ads: readonly Ad[]): { ad: Ad; href: string; image: string | null }[] {
  const shown: { ad: Ad; href: string; image: string | null }[] = [];
  for (const ad of ads) {
    const href = adClickUrl(ad.clickUrl);
    if (ad.creativeId && ad.headline && href) {
      shown.push({ ad, href, image: adImageUrl(ad.imageUrl) });
    }
  }
  return shown;
}

/**
 * A sponsored slot (web: `app-sponsored-slot`): `GET /ads?placement=&game=` for this viewer and
 * plan. Nothing while `advertising` is off, while the account is not ready, for `[]` (Premium,
 * `ads.enabled` entitlements) or on errors. Served again after a sign-in or an upgrade (the plan
 * is part of the query key).
 */
export function SponsoredSlot({
  placement,
  game,
  variant = 'card',
  style,
}: {
  placement: AdPlacement;
  game?: string | null;
  variant?: 'card' | 'compact';
  style?: StyleProp<ViewStyle>;
}) {
  const account = useAccount();
  const advertising = useFeature(FEATURE.advertising);
  const premium = useFeature(FEATURE.premiumPlans);
  const ads = useAds(
    placement,
    game,
    account.me?.plan ?? null,
    advertising.enabled && account.status === 'ready'
  );
  const shown = advertising.enabled ? shownAds(ads.data ?? []) : [];
  if (shown.length === 0) {
    return null;
  }
  return (
    <View style={[styles.slot, style]} testID={`sponsored-slot-${placement}`}>
      {shown.map((item) => (
        <SponsoredAd
          key={item.ad.creativeId}
          ad={item.ad}
          href={item.href}
          image={item.image}
          variant={variant}
          removeAdsLink={premium.enabled}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { gap: spacing[2] },
  ad: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 1,
    fontWeight: fontWeight.semibold,
    overflow: 'hidden',
  },
  remove: { textDecorationLine: 'underline' },
  link: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  pressed: { opacity: 0.8 },
  image: { width: 72, height: 72, borderRadius: radius.sm },
  imageSmall: { width: 48, height: 48, borderRadius: radius.sm },
  body: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
});
