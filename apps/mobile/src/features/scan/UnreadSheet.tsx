import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import {
  fontFamily,
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { REVIEW_COPY, SCAN_COPY } from './scanCopy';
import { ScanPhotoImage } from './ScanPhotoImage';
import { isGivenUp, type ScanTile } from './scanSession';
import { SheetHeader, useLastValue } from './SheetParts';

const PICTURE = { width: 104, height: 152 };

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TIPS: readonly { icon: IconName; label: string }[] = [
  { icon: 'crop-free', label: SCAN_COPY.tipFillFrame },
  { icon: 'white-balance-sunny', label: SCAN_COPY.tipNoGlare },
  { icon: 'hand-back-left-outline', label: SCAN_COPY.tipHoldStill },
];

export interface UnreadSheetProps {
  /** The tile that could not be read; null: closed. */
  tile: ScanTile | null;
  onRemove: () => void;
  onClose: () => void;
  /** "Search by name or code", the main button. */
  onSearch: () => void;
  /** "Take it again": removes this tile and goes back to the camera. */
  onTakeAgain: () => void;
  /** A card given up after server errors: "Try again" asks for its match once more. */
  onRetry: () => void;
  /** Its match is being tried again: "Trying again…". */
  trying?: boolean;
}

/**
 * Couldn't read this card (mockup screen 29, a sheet): "Remove" and Close, "Your photo" next to an
 * empty "Our match" ("No match yet"), what to do, three tips, "Search by name or code" and "Take
 * it again". For a card the scan gave up after the API kept failing on its match (the read was
 * fine): "Couldn't match this card", "We couldn't match this card right now…", no tips (the photo
 * is not the problem), "Search by name or code" and "Try again" ("Trying again…" while it is
 * tried; the sheet goes once the card is matched).
 */
export function UnreadSheet(props: UnreadSheetProps) {
  const visible = props.tile !== null;
  const shown = useLastValue(props.tile);
  return (
    <BottomSheet visible={visible} onClose={props.onClose} testID="scan-unread-sheet">
      {shown ? <Unread {...props} tile={shown} /> : null}
    </BottomSheet>
  );
}

function Unread({
  tile,
  onRemove,
  onClose,
  onSearch,
  onTakeAgain,
  onRetry,
  trying = false,
}: UnreadSheetProps & { tile: ScanTile }) {
  const { palette } = useTheme();
  const unmatched = isGivenUp(tile);
  return (
    <View style={styles.body}>
      <SheetHeader
        title={unmatched ? SCAN_COPY.unmatchedTitle : SCAN_COPY.unreadTitle}
        onRemove={onRemove}
        onClose={onClose}
        testID="scan-unread"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.pictures}>
          <View style={styles.picture}>
            <ScanPhotoImage uri={tile.photos[0]?.uri} style={PICTURE} testID="scan-unread-photo" />
            <Text
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[styles.caption, { color: palette.textMuted }]}
            >
              {SCAN_COPY.yourPhoto}
            </Text>
          </View>
          <View style={styles.picture}>
            <View
              style={[styles.empty, { borderColor: palette.textDisabled }]}
              testID="scan-unread-no-match"
            >
              <Text
                importantForAccessibility="no"
                accessibilityElementsHidden
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[styles.question, { color: palette.textDisabled }]}
              >
                ?
              </Text>
              <Text
                maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
                style={[styles.emptyText, { color: palette.textMuted }]}
              >
                {SCAN_COPY.noMatchYet}
              </Text>
            </View>
            <Text
              maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
              style={[styles.caption, { color: palette.textMuted }]}
            >
              {SCAN_COPY.ourMatch}
            </Text>
          </View>
        </View>
        <Text
          style={[textStyle('sm'), styles.text, { color: palette.textMuted }]}
          testID="scan-unread-text"
        >
          {unmatched ? SCAN_COPY.unmatchedText : SCAN_COPY.unreadText}
        </Text>
        {unmatched ? null : <Tips />}
      </ScrollView>
      <View style={styles.actions}>
        <PillButton
          label={SCAN_COPY.searchByNameOrCode}
          icon="magnify"
          onPress={onSearch}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="scan-unread-search"
        />
        {unmatched ? (
          <SecondButton
            label={trying ? REVIEW_COPY.tryingAgain : REVIEW_COPY.tryAgain}
            icon="refresh"
            busy={trying}
            onPress={onRetry}
            testID="scan-unread-retry"
          />
        ) : (
          <SecondButton
            label={SCAN_COPY.takeItAgain}
            icon="restore"
            onPress={onTakeAgain}
            testID="scan-unread-again"
          />
        )}
      </View>
    </View>
  );
}

/** Three tips for the next photo; one element each for the screen reader (the icon is decorative). */
function Tips() {
  const { palette } = useTheme();
  return (
    <View style={styles.tips}>
      {TIPS.map((tip) => (
        // One element per tip for the screen reader: its icon is decorative.
        <View key={tip.label} accessible accessibilityLabel={tip.label} style={styles.tip}>
          <View
            style={[
              styles.tipIcon,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <MaterialCommunityIcons name={tip.icon} size={22} color={palette.ink} />
          </View>
          <Text
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[styles.tipLabel, { color: palette.ink }]}
          >
            {tip.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The outlined button under the search: "Take it again", or "Try again" for a card given up. Busy
 * (a try under way): a small spinner before its word, and off.
 */
function SecondButton({
  label,
  icon,
  busy = false,
  onPress,
  testID,
}: {
  label: string;
  icon: IconName;
  busy?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.again,
        { borderColor: palette.borderStrong },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={palette.ink}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <MaterialCommunityIcons name={icon} size={18} color={palette.ink} />
      )}
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[textStyle('md'), styles.againLabel, { color: palette.ink }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flexShrink: 1, gap: spacing[3] },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: spacing[3] },
  pictures: { flexDirection: 'row', justifyContent: 'center', gap: spacing[4] },
  picture: { alignItems: 'center', gap: 6 },
  caption: {
    width: PICTURE.width,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  empty: {
    ...PICTURE,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  question: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: fontWeight.bold,
  },
  emptyText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold, textAlign: 'center' },
  text: { textAlign: 'center' },
  tips: { flexDirection: 'row', gap: 8 },
  tip: { flex: 1, alignItems: 'center', gap: 6 },
  tipIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipLabel: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold, textAlign: 'center' },
  actions: { gap: 10 },
  again: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing[4],
  },
  againLabel: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
