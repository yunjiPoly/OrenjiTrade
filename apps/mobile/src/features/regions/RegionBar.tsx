import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useRegionOptions } from '@/src/api/hooks/regions';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { Text } from '@/src/components/ui/Text';
import { regionName } from '@/src/lib/place';
import { PINNED_MAX_FONT_SCALE, fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { useBrowsingRegion } from './browsingRegion';

export interface RegionBarProps {
  /**
   * `bar` (default): the switcher with the region's name, and the "not your region" line under
   * it (Search's list of states for screen readers). `pill`: the switcher alone, over the map of
   * Search (the accent colour says when another region than the collector's is shown; the line is
   * `RegionAwayNote`, under the field).
   */
  variant?: 'bar' | 'pill';
  /**
   * The bar stays on screen above a list that scrolls under it: its texts follow the system text
   * size only a little, so the bar stays a line or two at any size instead of taking the screen.
   * Where the bar scrolls with the page it follows it fully.
   */
  pinned?: boolean;
  style?: StyleProp<ViewStyle>;
  /** The switcher; its sheet is `<testID>-sheet`, the away note `<testID>-away`. */
  testID?: string;
}

/**
 * The region switcher (the web's top-left one, ADR 0017), wherever the app browses by region: it
 * names the region on screen and opens a sheet with the three regions. Search, card holders, the
 * map and its binder lists follow the choice at once.
 *
 * A collector looking at another region than their own sees it at a glance: the switcher takes
 * the accent colour, a line says so and one press brings them back.
 */
export function RegionBar({
  variant = 'bar',
  pinned = false,
  style,
  testID = 'region-switcher',
}: RegionBarProps) {
  const cap = pinned ? PINNED_MAX_FONT_SCALE : undefined;
  const { palette } = useTheme();
  const { region, home, away, select } = useBrowsingRegion();
  const options = useRegionOptions().map((option) => ({
    value: option.code,
    label: option.name,
    detail: option.code === home ? 'Your region' : undefined,
  }));
  const homeName = options.find((option) => option.value === home)?.label ?? regionName(home);

  if (variant === 'pill') {
    return (
      <SelectSheet
        compact
        label="Region"
        icon="earth"
        tone={away ? 'accent' : 'default'}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        options={options}
        value={region}
        onChange={select}
        testID={testID}
      />
    );
  }

  return (
    <View style={[styles.bar, style]}>
      <SelectSheet
        compact
        wrap
        label="Region"
        icon="earth"
        tone={away ? 'accent' : 'default'}
        maxFontSizeMultiplier={cap}
        options={options}
        value={region}
        onChange={select}
        testID={testID}
      />
      {away && home ? (
        <View style={styles.away} testID={`${testID}-away`}>
          <Text
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={cap}
            style={[textStyle('sm'), styles.strong, { color: palette.ink }]}
          >
            Not your region.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Back to ${homeName}`}
            accessibilityShowsLargeContentViewer={pinned}
            accessibilityLargeContentTitle={`Back to ${homeName}`}
            onPress={() => select(home)}
            hitSlop={8}
            testID={`${testID}-home`}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Text
              maxFontSizeMultiplier={cap}
              style={[textStyle('sm'), styles.link, { color: palette.accent }]}
            >
              Back to {homeName}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * "Not your region. Back to {home}" alone, while another region than the collector's is browsed
 * (Search's map shows it under its field: the pill over the map has no room for it).
 */
export function RegionAwayNote({ testID = 'region-away' }: { testID?: string }) {
  const { palette } = useTheme();
  const { home, away, select } = useBrowsingRegion();
  const homeName =
    useRegionOptions().find((option) => option.code === home)?.name ?? regionName(home);
  if (!away || !home) {
    return null;
  }
  return (
    <View style={styles.away} testID={testID}>
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[textStyle('sm'), styles.strong, { color: palette.ink }]}
      >
        Not your region.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Back to ${homeName}`}
        onPress={() => select(home)}
        hitSlop={8}
        testID={`${testID}-home`}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('sm'), styles.link, { color: palette.accent }]}
        >
          Back to {homeName}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing[3],
    rowGap: spacing[1],
  },
  away: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing[2] },
  strong: { fontWeight: fontWeight.semibold },
  back: { minHeight: 36, justifyContent: 'center' },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
});
