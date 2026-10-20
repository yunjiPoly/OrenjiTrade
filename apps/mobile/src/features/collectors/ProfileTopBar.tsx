import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CollectorProfileResponse } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { PROFILE_COPY } from './profileCopy';

export interface ProfileTopBarProps {
  topInset: number;
  /** The collector's handle ("More for {handle}"). */
  handle: string;
  onBack: () => void;
  /** Another collector's profile: "⋯" (Share profile, Report, Block). */
  onMore?: () => void;
  /**
   * Scrolled past the header (mockup screen 20): the bar shows the avatar, the name and a small
   * "Message" (when messaging is possible).
   */
  compact?: {
    profile: CollectorProfileResponse;
    onMessage?: () => void;
    messaging: boolean;
  } | null;
}

/**
 * The top bar of a profile opened over the tabs (mockup screens 19 and 20): back and "⋯"; once
 * the header has scrolled away, the avatar, the name and "Message" join it, over a hairline.
 */
export function ProfileTopBar({ topInset, handle, onBack, onMore, compact }: ProfileTopBarProps) {
  const { palette } = useTheme();
  const profile = compact?.profile ?? null;
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: topInset + 8,
          backgroundColor: palette.background,
          borderBottomColor: profile ? palette.border : 'transparent',
        },
      ]}
      testID="profile-top-bar"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={PROFILE_COPY.back}
        onPress={onBack}
        // The id of the navigation header's back button: the flows go back the same way.
        testID="BackButton"
        style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={palette.ink} />
      </Pressable>
      <View style={styles.middle}>
        {profile ? (
          <>
            <Avatar src={profile.avatarUrl} name={profile.displayName} size={30} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[styles.name, { color: palette.ink }]}
              testID="profile-top-bar-name"
            >
              {profile.displayName}
            </Text>
            {compact?.onMessage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={PROFILE_COPY.message(profile.handle)}
                disabled={compact.messaging}
                onPress={compact.onMessage}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                testID="profile-top-bar-message"
                style={({ pressed }) => [
                  styles.message,
                  { backgroundColor: palette.primary },
                  (pressed || compact.messaging) && styles.pressed,
                ]}
              >
                <Text
                  maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                  style={[styles.messageLabel, { color: palette.onPrimary }]}
                >
                  {compact.messaging ? PROFILE_COPY.opening : PROFILE_COPY.messageShort}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={PROFILE_COPY.more(handle)}
          onPress={onMore}
          testID="collector-menu"
          style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={24} color={palette.ink} />
        </Pressable>
      ) : (
        <View style={styles.icon} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  message: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageLabel: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.7 },
});
