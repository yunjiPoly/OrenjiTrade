import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PublicBinderOwner } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import { GENERIC_PLACE_LABEL } from '@/src/lib/place';
import { fontWeight, useTheme } from '@/src/theme';

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
 * handle and "{province} · {n} public binders"; it opens the owner's profile.
 */
export function SellerRow({
  owner,
  publicBinders,
  testID = 'binder-seller',
}: {
  owner: PublicBinderOwner;
  publicBinders: number;
  testID?: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const province = ownerProvince(owner);
  const line = DECK_CORE_COPY.sellerLine(province, publicBinders);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={DECK_CORE_COPY.sellerLabel(owner.handle, line)}
      onPress={() => router.push({ pathname: '/collectors/[id]', params: { id: owner.handle } })}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <Avatar src={owner.avatarUrl} name={owner.displayName || owner.handle} size={40} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.handle, { color: palette.ink }]}>
          {owner.handle}
        </Text>
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
