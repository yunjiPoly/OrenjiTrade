import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/src/theme';

import { GUEST_COPY } from './guestCopy';
import { useGuestEntry } from './useGuestEntry';

/**
 * The person button that takes the bell's place on Home and Search for a guest (stage R15; mockup
 * v50 screen 70): the 44 pt round button of those top bars, spoken "Sign in", opening Sign in
 * (36). Once signed in the phone comes back to the screen it was tapped on.
 */
export function PersonButton({ testID = 'person-button' }: { testID?: string }) {
  const { palette } = useTheme();
  const { signIn } = useGuestEntry();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={GUEST_COPY.personButton}
      accessibilityHint={GUEST_COPY.personButtonHint}
      onPress={() => void signIn()}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name="account-outline" size={22} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
