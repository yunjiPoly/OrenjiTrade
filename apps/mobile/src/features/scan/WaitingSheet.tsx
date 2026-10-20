import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import {
  fontWeight,
  PINNED_MAX_FONT_SCALE,
  spacing,
  textStyle,
  TITLE_MAX_FONT_SCALE,
  useTheme,
} from '@/src/theme';

import { REVIEW_COPY, SCAN_COPY, TILE_STATUS_TEXT } from './scanCopy';
import { ScanPhotoImage } from './ScanPhotoImage';
import type { ScanTile } from './scanSession';
import { SheetHeader, useLastValue } from './SheetParts';

const PICTURE = { width: 104, height: 152 };

export interface WaitingSheetProps {
  /** The tile waiting for the connection; null: closed (it closes once its answer lands). */
  tile: ScanTile | null;
  /** Its match is being tried again right now: "Trying again…". */
  trying: boolean;
  onRetry: () => void;
  /** "Search by name or code": the search is always one tap away. */
  onSearch: () => void;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * A tile of the tray waiting for the connection, tapped (owner spec 2026-10-15, sections 4 and 5:
 * the search is always one tap away): its match is tried again at once, and this sheet offers
 * "Try again" ("Trying again…" while it is tried) and "Search by name or code", with "Remove" and
 * Close at the top, under the tile's own status "Waiting for connection". It closes by itself when
 * the tile is matched (the screen reader hears the result). Only the app's existing words.
 */
export function WaitingSheet(props: WaitingSheetProps) {
  const visible = props.tile !== null;
  const shown = useLastValue(props.tile);
  return (
    <BottomSheet visible={visible} onClose={props.onClose} testID="scan-waiting-sheet">
      {shown ? <Waiting {...props} tile={shown} /> : null}
    </BottomSheet>
  );
}

function Waiting({
  tile,
  trying,
  onRetry,
  onSearch,
  onRemove,
  onClose,
}: WaitingSheetProps & { tile: ScanTile }) {
  const { palette } = useTheme();
  return (
    <View style={styles.body}>
      <SheetHeader
        title={TILE_STATUS_TEXT.WAITING}
        onRemove={onRemove}
        onClose={onClose}
        testID="scan-waiting"
      />
      <View style={styles.picture}>
        <ScanPhotoImage uri={tile.photos[0]?.uri} style={PICTURE} testID="scan-waiting-photo" />
        <Text
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.caption, { color: palette.textMuted }]}
        >
          {SCAN_COPY.yourPhoto}
        </Text>
      </View>
      <View style={styles.actions}>
        <PillButton
          label={REVIEW_COPY.tryAgain}
          icon="refresh"
          loading={trying}
          loadingLabel={REVIEW_COPY.tryingAgain}
          onPress={onRetry}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="scan-waiting-retry"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SCAN_COPY.searchByNameOrCode}
          onPress={onSearch}
          style={({ pressed }) => [
            styles.search,
            { borderColor: palette.borderStrong },
            pressed && styles.pressed,
          ]}
          testID="scan-waiting-search"
        >
          <MaterialCommunityIcons name="magnify" size={18} color={palette.ink} />
          <Text
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[textStyle('md'), styles.searchLabel, { color: palette.ink }]}
          >
            {SCAN_COPY.searchByNameOrCode}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flexShrink: 1, gap: spacing[3] },
  picture: { alignItems: 'center', gap: 6 },
  caption: {
    width: PICTURE.width,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  actions: { gap: 10 },
  search: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing[4],
  },
  searchLabel: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
