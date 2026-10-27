import { ScrollView, StyleSheet, View } from 'react-native';

import { useGuestAction } from '@/src/account/guestAction';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import {
  PINNED_MAX_FONT_SCALE,
  TITLE_MAX_FONT_SCALE,
  fontFamily,
  fontWeight,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { GUEST_COPY } from './guestCopy';
import { useGuestEntry } from './useGuestEntry';

/**
 * 71, the sheet a guest gets instead of an action that needs an account (stage R15; mockup v50
 * HomeGuestAsk): its title says what they tried ("Sign in to message this collector", "Sign in to
 * tell them you have it", "Sign in to see collector profiles", "Sign in to save your wishes"),
 * "It’s free. When you’re done, you come right back here.", Create account, Sign in and Not now.
 *
 * One sheet for the whole app (rendered by the root navigator), opened with
 * `useGuestAction.getState().open(action)`. Create account and Sign in keep the action, which
 * finishes once the account is ready; Not now and the backdrop forget it.
 */
export function SignInSheet() {
  const { palette } = useTheme();
  const ask = useGuestAction((state) => state.ask);
  const { signIn, createAccount } = useGuestEntry({ keepAction: true });
  const title = ask ? GUEST_COPY.sheet.titles[ask] : '';

  const go = (next: () => Promise<void>) => {
    useGuestAction.getState().hide();
    void next();
  };

  return (
    <BottomSheet
      visible={ask !== null}
      onClose={() => useGuestAction.getState().dismiss()}
      testID="sign-in-sheet"
    >
      {/* The words scroll at the largest text sizes; the three buttons stay in reach. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.words} bounces={false}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink }]}
          testID="sign-in-sheet-title"
        >
          {title}
        </Text>
        <Text style={[textStyle('md'), styles.text, { color: palette.textMuted }]}>
          {GUEST_COPY.sheet.text}
        </Text>
      </ScrollView>
      <View style={styles.buttons}>
        <PillButton
          label={GUEST_COPY.createAccount}
          onPress={() => go(createAccount)}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="sign-in-sheet-create"
        />
        <PillButton
          label={GUEST_COPY.signIn}
          variant="outline"
          onPress={() => go(signIn)}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="sign-in-sheet-sign-in"
        />
        <PillButton
          label={GUEST_COPY.sheet.notNow}
          variant="quiet"
          onPress={() => useGuestAction.getState().dismiss()}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="sign-in-sheet-not-now"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  words: { gap: spacing[2] },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  text: { lineHeight: 21 },
  buttons: { gap: 10 },
});
