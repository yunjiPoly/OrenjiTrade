import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { ADD_CARDS_COPY } from './inventoryCopy';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface AddCardsStartProps {
  /** The search field: opens the search with the keyboard up (screen 4). */
  onSearch: () => void;
  /** "Import a deck" (the stage S5 import screen, deck file). */
  onImportDeck: () => void;
  /** "Import from Collectr" (the stage S5 import screen, CSV export). */
  onImportCollectr: () => void;
  /**
   * The card scan's two rows, before the imports (owner spec 2026-10-15, screen 26), when the scan
   * is available here (the flag `cardTextScan` on and a build with the reader); otherwise the
   * camera stays "Coming later".
   */
  scan?: { onCamera: () => void; onPhotos: () => void } | null;
}

/**
 * Add cards (owner spec 2026-10-14, section 6, screen 3): the big search first ("The fastest way
 * to add one card"), then "Add many at once" with the two imports of stage S5, and the camera
 * marked "Coming later" (card scanning is on hold). New cards start private. Where the card scan
 * is available, "Scan with camera" ("New") and "Choose from photos" take the camera's place, before
 * the imports (owner spec 2026-10-15, screen 26).
 */
export function AddCardsStart({
  onSearch,
  onImportDeck,
  onImportCollectr,
  scan = null,
}: AddCardsStartProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.root} testID="add-cards-start">
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
        style={[styles.title, { color: palette.ink }]}
      >
        {ADD_CARDS_COPY.title}
      </Text>

      <View style={styles.searchBlock}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={ADD_CARDS_COPY.searchLabel}
          accessibilityHint={ADD_CARDS_COPY.searchHint}
          onPress={onSearch}
          testID="add-cards-search"
          style={({ pressed }) => [
            styles.search,
            { backgroundColor: palette.surface, borderColor: palette.primary },
            pressed && styles.pressed,
          ]}
        >
          <MaterialCommunityIcons name="magnify" size={22} color={palette.primary} />
          <Text numberOfLines={2} style={[styles.placeholder, { color: palette.textMuted }]}>
            {ADD_CARDS_COPY.searchPlaceholder}
          </Text>
        </Pressable>
        <Text style={[styles.hint, { color: palette.textMuted }]}>{ADD_CARDS_COPY.searchHint}</Text>
      </View>

      <View style={styles.many}>
        <Text accessibilityRole="header" style={[styles.section, { color: palette.textMuted }]}>
          {ADD_CARDS_COPY.manyAtOnce.toUpperCase()}
        </Text>
        {scan ? (
          <>
            <Option
              icon="camera-outline"
              iconColor={palette.onPrimary}
              iconBackground={palette.primary}
              title={ADD_CARDS_COPY.scanTitle}
              tag={ADD_CARDS_COPY.scanNew}
              body={ADD_CARDS_COPY.scanCameraBody}
              onPress={scan.onCamera}
              testID="add-cards-scan-camera"
            />
            <Option
              icon="image-multiple-outline"
              iconColor={palette.ink}
              iconBackground={palette.surfaceVariant}
              title={ADD_CARDS_COPY.photosTitle}
              body={ADD_CARDS_COPY.photosBody}
              onPress={scan.onPhotos}
              testID="add-cards-scan-photos"
            />
          </>
        ) : null}
        <Option
          icon="cards-outline"
          iconColor={palette.onPrimaryContainer}
          iconBackground={palette.primaryContainer}
          title={ADD_CARDS_COPY.deckTitle}
          body={ADD_CARDS_COPY.deckBody}
          onPress={onImportDeck}
          testID="add-cards-import-deck"
        />
        <Option
          icon="file-document-outline"
          iconColor={palette.onAccentContainer}
          iconBackground={palette.accentContainer}
          title={ADD_CARDS_COPY.collectrTitle}
          body={ADD_CARDS_COPY.collectrBody}
          onPress={onImportCollectr}
          testID="add-cards-import-collectr"
        />
        {scan ? null : (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${ADD_CARDS_COPY.scanTitle}, ${ADD_CARDS_COPY.comingLater}`}
            accessibilityHint={ADD_CARDS_COPY.scanBody}
            aria-disabled
            testID="add-cards-scan"
            style={[styles.option, styles.scan, { borderColor: palette.borderStrong }]}
          >
            <View style={[styles.icon, { backgroundColor: palette.surfaceVariant }]}>
              <MaterialCommunityIcons name="camera-outline" size={22} color={palette.textMuted} />
            </View>
            <View style={styles.texts}>
              <Text style={[styles.optionTitle, { color: palette.ink }]}>
                {ADD_CARDS_COPY.scanTitle}
              </Text>
              <Text style={[styles.optionBody, { color: palette.textMuted }]}>
                {ADD_CARDS_COPY.scanBody}
              </Text>
            </View>
            <Text
              style={[styles.tag, { backgroundColor: palette.surfaceVariant, color: palette.ink }]}
            >
              {ADD_CARDS_COPY.comingLater}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.grow} />
      <Text style={[styles.footer, { color: palette.textMuted }]} testID="add-cards-footer">
        {ADD_CARDS_COPY.footer}
      </Text>
    </View>
  );
}

function Option({
  icon,
  iconColor,
  iconBackground,
  title,
  tag,
  body,
  onPress,
  testID,
}: {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  title: string;
  /** A small tag after the title ("New"). */
  tag?: string;
  body: string;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tag ? `${title}, ${tag}` : title}
      accessibilityHint={body}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: iconBackground }]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.texts}>
        {tag ? (
          <View style={styles.titleRow}>
            <Text style={[styles.optionTitle, { color: palette.ink }]}>{title}</Text>
            <Text
              style={[
                styles.newTag,
                { backgroundColor: palette.accentContainer, color: palette.onAccentContainer },
              ]}
            >
              {tag}
            </Text>
          </View>
        ) : (
          <Text style={[styles.optionTitle, { color: palette.ink }]}>{title}</Text>
        )}
        <Text style={[styles.optionBody, { color: palette.textMuted }]}>{body}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, gap: 20 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
  },
  searchBlock: { gap: 10 },
  search: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  placeholder: { flex: 1, fontSize: 16, lineHeight: 22 },
  hint: { fontSize: 13, lineHeight: 18, marginHorizontal: 4 },
  many: { gap: 10 },
  section: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    marginHorizontal: 4,
    marginTop: 4,
  },
  option: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
  },
  scan: { borderStyle: 'dashed' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 3 },
  optionTitle: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.semibold },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  newTag: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: fontWeight.bold,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  optionBody: { fontSize: 13, lineHeight: 18 },
  tag: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  grow: { flexGrow: 1, minHeight: spacing[6] },
  footer: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
