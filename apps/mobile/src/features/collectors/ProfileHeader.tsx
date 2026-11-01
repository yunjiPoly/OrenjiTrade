import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CollectorProfileResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  spacing,
  TITLE_MAX_FONT_SCALE,
  useStackedRows,
  useTheme,
} from '@/src/theme';
import { HandleText } from '@/src/components/ui/HandleText';

import { PROFILE_COPY } from './profileCopy';
import { profileChips, profileLine, ratingText } from './profileRules';

export interface ProfileHeaderProps {
  profile: CollectorProfileResponse;
  own: boolean;
  /** The star beside the handle scrolls to "Ratings & references". */
  onRating: () => void;
  /** Your own page without a public place: "Not on the map" opens Settings › Location. */
  onLocation?: () => void;
}

/**
 * The top of a profile (owner spec 2026-10-14, section 9; mockup screens 19 and 21): a 64 pt
 * avatar with the online dot (only when the collector shows it), the name, "@{handle} · ★ {rating}"
 * (the star scrolls to the ratings), the chips beside the avatar (games first in orange, then the
 * tags), and one small line under it: "{city, }{province} · Member since {year} · Active this
 * week" (the city only while its owner shows it; the activity only another collector's, "this
 * week" or "this month", nothing finer or older; ADR 0017).
 */
export function ProfileHeader({ profile, own, onRating, onLocation }: ProfileHeaderProps) {
  const { palette } = useTheme();
  // From the larger text sizes on, the avatar stands above the name: beside it, the name, the
  // handle and the chips kept a narrow column and broke the handle in the middle (the walk at the
  // largest size).
  const stacked = useStackedRows();
  const rating = ratingText(profile.rating);
  const chips = profileChips(profile.games, profile.tags);
  const line = profileLine(profile, own);
  const online = !own && profile.onlineStatus === 'ONLINE';
  const prefix = own ? 'profile' : 'collector';
  const lineText = [line.place ?? (own ? PROFILE_COPY.notOnMap : null), line.member, line.active]
    .filter(Boolean)
    .join(' · ');
  const lineLinks = own && !line.place && !!onLocation;

  return (
    <View style={styles.root}>
      <View style={[styles.top, stacked && styles.topStacked]} testID={`${prefix}-header`}>
        <View style={styles.avatar}>
          <Avatar src={profile.avatarUrl} name={profile.displayName} size={64} />
          {online ? (
            <View
              accessibilityRole="image"
              accessibilityLabel={PROFILE_COPY.onlineNow}
              testID={`${prefix}-online`}
              style={[
                styles.online,
                { backgroundColor: palette.online.online, borderColor: palette.background },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.identity}>
          <View style={styles.names}>
            <Text
              accessibilityRole="header"
              testID={`${prefix}-name`}
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[styles.name, { color: palette.ink }]}
            >
              {profile.displayName}
            </Text>
            <View style={styles.handleRow}>
              <HandleText
                testID={own ? 'profile-handle-label' : 'collector-handle'}
                style={[styles.handle, { color: palette.textMuted }]}
              >
                @{profile.handle}
              </HandleText>
              {rating ? (
                <Text
                  accessible={false}
                  importantForAccessibility="no"
                  aria-hidden
                  style={[styles.handle, { color: palette.textMuted }]}
                >
                  ·
                </Text>
              ) : null}
              {rating ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={PROFILE_COPY.rating(rating)}
                  onPress={onRating}
                  hitSlop={8}
                  testID={`${prefix}-rating`}
                  style={({ pressed }) => [styles.star, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="star" size={14} color={palette.warning} />
                  <Text style={[styles.ratingText, { color: palette.warning }]}>{rating}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          {chips.length > 0 ? (
            <View
              accessibilityRole="list"
              accessibilityLabel={PROFILE_COPY.chips}
              style={styles.chips}
              testID={`${prefix}-chips`}
            >
              {chips.map((chip) => (
                <View
                  key={`${chip.kind}-${chip.label}`}
                  style={[
                    styles.chip,
                    chip.kind === 'game'
                      ? {
                          backgroundColor: palette.profile.gameChipBackground,
                          borderColor: palette.profile.gameChipBorder,
                        }
                      : {
                          backgroundColor: palette.profile.tagChipBackground,
                          borderColor: palette.profile.tagChipBorder,
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      {
                        color:
                          chip.kind === 'game'
                            ? palette.profile.gameChipText
                            : palette.profile.tagChipText,
                      },
                    ]}
                  >
                    {chip.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {lineLinks ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={lineText}
          accessibilityHint={PROFILE_COPY.notOnMapHint}
          onPress={onLocation}
          testID={`${prefix}-line`}
          style={({ pressed }) => [styles.lineButton, pressed && styles.pressed]}
        >
          <Text style={[styles.line, { color: palette.textMuted }]}>
            <Text style={[styles.lineLink, { color: palette.accent }]}>
              {PROFILE_COPY.notOnMap}
            </Text>
            {` · ${line.member}`}
          </Text>
        </Pressable>
      ) : (
        <Text testID={`${prefix}-line`} style={[styles.line, { color: palette.textMuted }]}>
          {lineText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  topStacked: { flexDirection: 'column', gap: spacing[3] },
  avatar: { width: 64, height: 64 },
  online: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
  },
  identity: { flex: 1, minWidth: 0, gap: spacing[2] },
  names: { gap: 2 },
  name: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  handle: { fontSize: 13, lineHeight: 18 },
  star: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 28 },
  ratingText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 26,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  line: { fontSize: 12, lineHeight: 17 },
  lineLink: { fontWeight: fontWeight.semibold },
  lineButton: { minHeight: 44, justifyContent: 'center', marginVertical: -12 },
  pressed: { opacity: 0.7 },
});
