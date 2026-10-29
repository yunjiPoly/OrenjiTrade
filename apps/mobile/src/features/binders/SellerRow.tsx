import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useGuestAction } from '@/src/account/guestAction';
import type { PublicBinderOwner } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import { GUEST_COPY } from '@/src/features/guest/guestCopy';
import { GuestAvatar } from '@/src/features/guest/GuestParts';
import { GENERIC_PLACE_LABEL } from '@/src/lib/place';
import { fontWeight, useTheme } from '@/src/theme';
import { HandleText } from '@/src/components/ui/HandleText';

import { DECK_CORE_COPY } from './binderCopy';

/**
 * The province of a binder's owner (never a city, ADR 0017): "{province}" as the deck core page
 * says it (spec section 3: places are "{province}" or "{province}, {country}").
 */
export function ownerProvince(owner: Pick<PublicBinderOwner, 'place'>): string {
  return owner.place?.subdivisionName || owner.place?.label || GENERIC_PLACE_LABEL;
}

/**
 * The seller row of a deck core page and of a public binder (mockup screen 16): the avatar, the
 * handle and "{province} · {n} public binders"; it opens the owner's profile. A guest never sees
 * who it is (stage R15): "A collector" with a plain avatar and the place, and a tap asks them to
 * sign in (the profile opens after, found by the binder).
 */
export function SellerRow({
  owner,
  binderId,
  publicBinders,
  testID = 'binder-seller',
}: {
  owner: PublicBinderOwner;
  /** The binder on screen: a guest's tap is kept by it, never by the collector. */
  binderId: string;
  publicBinders: number;
  testID?: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const province = ownerProvince(owner);
  const line = DECK_CORE_COPY.sellerLine(province, publicBinders);
  const handle = owner.handle;
  return (
    <Pressable
      accessibilityRole={handle ? 'link' : 'button'}
      accessibilityLabel={
        handle ? DECK_CORE_COPY.sellerLabel(handle, line) : GUEST_COPY.ownerLabel(line)
      }
      onPress={() =>
        handle
          ? router.push({ pathname: '/collectors/[id]', params: { id: handle } })
          : useGuestAction
              .getState()
              .open({ kind: 'profile', listing: { binderId }, page: 'profile' })
      }
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      {handle ? (
        <Avatar src={owner.avatarUrl} name={owner.displayName || handle} size={40} />
      ) : (
        <GuestAvatar size={40} testID={`${testID}-guest-avatar`} />
      )}
      <View style={styles.text}>
        <HandleText style={[styles.handle, { color: palette.ink }]}>
          {handle ?? GUEST_COPY.aCollector}
        </HandleText>
        <Text testID={`${testID}-line`} style={[styles.line, { color: palette.textMuted }]}>
          {line}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={palette.textDisabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  handle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  line: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.8 },
});
