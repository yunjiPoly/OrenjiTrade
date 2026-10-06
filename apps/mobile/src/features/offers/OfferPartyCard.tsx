import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { OfferParty } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { ratingLabel } from '@/src/features/map/discovery';
import { formatDistanceBucket, isDistanceBucket } from '@/src/lib/formatDistanceBucket';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * One party of an offer or trade (web: `app-offer-party-card`): avatar, role, name (opens the
 * profile), the region label and distance **bucket** when the collector is discoverable (never a
 * point) and the rating.
 */
export function OfferPartyCard({
  party,
  role,
  isYou = false,
  testID,
}: {
  party: OfferParty;
  role: string;
  isYou?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const bucket = party.location?.distanceBucket;
  const place = party.location?.publicLabel ?? null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${role}${isYou ? ' (you)' : ''}: ${party.displayName}. Opens their profile.`}
      onPress={() => router.push({ pathname: '/collectors/[id]', params: { id: party.handle } })}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        { borderColor: palette.border, backgroundColor: palette.surface },
        pressed && styles.pressed,
      ]}
    >
      <Avatar src={party.avatarUrl} name={party.displayName} size={40} />
      <View style={styles.body}>
        <Text style={[textStyle('xs'), styles.role, { color: palette.textMuted }]}>
          {role}
          {isYou ? ' · You' : ''}
        </Text>
        <Text style={[textStyle('md'), styles.name, { color: palette.ink }]}>
          {party.displayName}
        </Text>
        {place ? (
          <View style={styles.line}>
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={14}
              color={palette.textMuted}
            />
            <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
              {place}
              {isDistanceBucket(bucket) ? ` · ${formatDistanceBucket(bucket)}` : ''}
            </Text>
          </View>
        ) : null}
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {ratingLabel(party.rating)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
  },
  body: { flex: 1, gap: 2 },
  role: { textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontWeight: fontWeight.semibold },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  grow: { flex: 1 },
  pressed: { opacity: 0.8 },
});
