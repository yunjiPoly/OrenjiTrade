import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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

import { GradientFill } from './GradientFill';
import { GUEST_COPY } from './guestCopy';
import { useGuestEntry } from './useGuestEntry';

/**
 * The plain person avatar of a collector a guest does not see (stage R15): "A collector", never a
 * picture or initials.
 */
export function GuestAvatar({ size = 36, testID }: { size?: number; testID?: string }) {
  const { palette } = useTheme();
  return (
    // Read by no screen reader on its own: the row or header around it says "A collector".
    <View
      testID={testID}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.guest.avatarBackground,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="account-outline"
        size={Math.round(size / 2)}
        color={palette.guest.avatarIcon}
      />
    </View>
  );
}

/**
 * The link parameters that bring a guest page back after a remount: Search › Wishlist is a
 * segment of Search, held in its state, so `/search` alone would reopen on Cards when Review our
 * terms or the welcome replaced the tabs in between (review fix 1, U2).
 */
const RETURN_PARAMS: Partial<Record<GuestPageKind, Readonly<Record<string, string>>>> = {
  wishlist: { segment: 'wishlist' },
};

/** Create account and Sign in, as the guest pages offer them. */
function GuestButtons({ testID, kind }: { testID: string; kind: GuestPageKind }) {
  const { signIn, createAccount } = useGuestEntry({ returnParams: RETURN_PARAMS[kind] });
  return (
    <View style={styles.buttons}>
      <PillButton
        label={GUEST_COPY.createAccount}
        onPress={() => void createAccount()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID={`${testID}-create`}
      />
      <PillButton
        label={GUEST_COPY.signIn}
        variant="outline"
        onPress={() => void signIn()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID={`${testID}-sign-in`}
      />
    </View>
  );
}

/**
 * Home's card above the chips for a guest (stage R15; mockup v50 screen 70): "You’re browsing as a
 * guest", "Create a free account to message collectors, save wishes and list your own cards.",
 * Create account and Sign in. It takes Get started's place.
 */
export function GuestCard({ testID = 'home-guest-card' }: { testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { borderColor: palette.guest.cardBorder }]}>
      <GradientFill
        from={palette.guest.cardStart}
        to={palette.guest.cardEnd}
        angle="diagonal"
        id="guest-card"
        radius={16}
        testID={`${testID}-gradient`}
      />
      <View style={styles.cardWords}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.cardTitle, { color: palette.ink }]}
        >
          {GUEST_COPY.card.title}
        </Text>
        <Text style={[textStyle('sm'), styles.cardText, { color: palette.textMuted }]}>
          {GUEST_COPY.card.text}
        </Text>
      </View>
      <GuestCardButtons testID={testID} />
    </View>
  );
}

/** The card's two buttons: the orange pill and "Sign in" in the ink colour. */
function GuestCardButtons({ testID }: { testID: string }) {
  const { palette } = useTheme();
  const { signIn, createAccount } = useGuestEntry();
  return (
    <View style={styles.compactButtons}>
      <PillButton
        label={GUEST_COPY.createAccount}
        size="small"
        onPress={() => void createAccount()}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID={`${testID}-create`}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={GUEST_COPY.signIn}
        onPress={() => void signIn()}
        testID={`${testID}-sign-in`}
        style={({ pressed }) => [styles.cardSignIn, pressed && styles.pressed]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('sm'), styles.cardSignInText, { color: palette.ink }]}
        >
          {GUEST_COPY.signIn}
        </Text>
      </Pressable>
    </View>
  );
}

export type GuestPageKind = 'inventory' | 'messages' | 'profile' | 'wishlist';

/** The picture at the top of a guest page (72 to 75): decorative, read by no screen reader. */
function GuestIllustration({ kind }: { kind: GuestPageKind }) {
  const { palette } = useTheme();
  if (kind === 'inventory') {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.cards}>
        <View
          style={[styles.artCard, styles.artCardBack, { borderColor: palette.guest.artBorder }]}
        >
          <GradientFill
            from={palette.guest.artOneStart}
            to={palette.guest.artOneEnd}
            angle="down"
            id="guest-art-one"
            radius={7}
          />
        </View>
        <View
          style={[styles.artCard, styles.artCardFront, { borderColor: palette.guest.artBorder }]}
        >
          <GradientFill
            from={palette.guest.artTwoStart}
            to={palette.guest.artTwoEnd}
            angle="down"
            id="guest-art-two"
            radius={7}
          />
        </View>
        <View
          style={[
            styles.plus,
            { backgroundColor: palette.guest.plusBackground, borderColor: palette.background },
          ]}
        >
          <MaterialCommunityIcons name="plus" size={18} color={palette.guest.plusText} />
        </View>
      </View>
    );
  }
  const plain = kind === 'profile';
  const icon =
    kind === 'messages'
      ? 'message-outline'
      : kind === 'wishlist'
        ? 'heart-outline'
        : 'account-outline';
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.icon,
        {
          backgroundColor: plain ? palette.guest.plainIconBackground : palette.guest.iconBackground,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={38}
        color={plain ? palette.guest.plainIconText : palette.primary}
      />
    </View>
  );
}

/**
 * A member-only tab in place for a guest (stage R15; mockup v50 screens 72 to 75): an
 * illustration, a heading, a line, Create account and Sign in, and under them what a guest may
 * open there (Profile: Appearance, Trading safely and Legal). It scrolls at the largest text sizes.
 */
export function GuestPage({
  kind,
  after,
  style,
  testID,
}: {
  kind: GuestPageKind;
  /** What follows the buttons (Profile's rows). */
  after?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  const { palette } = useTheme();
  const copy = GUEST_COPY.pages[kind];
  return (
    <ScrollView style={[styles.fill, style]} contentContainerStyle={styles.page} testID={testID}>
      <View style={styles.pageBody}>
        <GuestIllustration kind={kind} />
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.pageTitle, { color: palette.ink }]}
          testID={`${testID}-title`}
        >
          {copy.title}
        </Text>
        <Text style={[textStyle('md'), styles.pageText, { color: palette.textMuted }]}>
          {copy.text}
        </Text>
        <GuestButtons testID={testID} kind={kind} />
      </View>
      {after}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    overflow: 'hidden',
  },
  cardWords: { gap: 3 },
  cardTitle: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.bold },
  cardText: { fontSize: 13, lineHeight: 19 },
  cardSignIn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[3] },
  cardSignInText: { fontSize: 14, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
  compactButtons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  buttons: { alignSelf: 'stretch', marginTop: 10, gap: 8 },
  page: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: spacing[2],
    paddingBottom: spacing[5],
    gap: spacing[4],
  },
  pageBody: {
    marginVertical: 'auto',
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    gap: 12,
  },
  pageTitle: {
    marginTop: spacing[2],
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  pageText: { maxWidth: 300, lineHeight: 23, textAlign: 'center' },
  icon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cards: { width: 116, height: 96, marginBottom: 4 },
  artCard: {
    position: 'absolute',
    width: 52,
    height: 74,
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'hidden',
  },
  artCardBack: { left: 12, top: 12, transform: [{ rotate: '-9deg' }] },
  artCardFront: { left: 44, top: 4 },
  plus: {
    position: 'absolute',
    right: 2,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
