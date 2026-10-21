import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useRegionOptions, useRegions } from '@/src/api/hooks/regions';
import { RadioSheet } from '@/src/components/ui/RadioSheet';
import { Text } from '@/src/components/ui/Text';
import { regionName } from '@/src/lib/place';
import {
  PINNED_MAX_FONT_SCALE,
  fontWeight,
  radius,
  spacing,
  textStyle,
  useTheme,
} from '@/src/theme';

import { useBrowsingRegion } from './browsingRegion';
import { REGION_COPY, regionLine } from './regionCopy';

export interface RegionBarProps {
  /**
   * `bar` (default): the switcher, and the "not your region" line under it (Search's list of
   * states for screen readers). `pill`: the switcher alone (over the map of Search, mockup screen
   * 11; Home's top row, stage R7): the line is `RegionAwayNote`, under the field.
   */
  variant?: 'bar' | 'pill';
  /**
   * The bar stays on screen above a list that scrolls under it: its texts follow the system text
   * size only a little, so the bar stays a line or two at any size instead of taking the screen.
   * Where the bar scrolls with the page it follows it fully.
   */
  pinned?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * The switcher; its sheet is `<testID>-sheet`, each region `<testID>-option-<code>`, the away
   * note `<testID>-away`.
   */
  testID?: string;
}

/**
 * The region switcher (the web's top-left one, ADR 0017), wherever the app browses by region: a
 * pill with the globe and the region's name that opens "Choose a region" (stage G, mockup screen
 * 35). Search, card holders, the map and its binder lists follow the choice at once.
 *
 * A collector looking at another region than their own sees it at a glance: the pill's border
 * turns orange, "Not your region. Back to {home}" says so and one press brings them back.
 */
export function RegionBar({
  variant = 'bar',
  pinned = false,
  style,
  testID = 'region-switcher',
}: RegionBarProps) {
  const cap = pinned || variant === 'pill' ? PINNED_MAX_FONT_SCALE : undefined;
  const { palette } = useTheme();
  const { region, home, away, select } = useBrowsingRegion();
  const [open, setOpen] = useState(false);
  const options = useRegionOptions();
  const name = options.find((option) => option.code === region)?.name ?? regionName(region);
  const homeName = options.find((option) => option.code === home)?.name ?? regionName(home);
  const label = REGION_COPY.pillLabel(name);

  const pill = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityShowsLargeContentViewer={cap !== undefined}
      accessibilityLargeContentTitle={label}
      onPress={() => setOpen(true)}
      hitSlop={4}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: away ? palette.primary : palette.borderStrong,
          backgroundColor: palette.surface,
        },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name="earth" size={16} color={palette.accent} />
      <Text
        maxFontSizeMultiplier={cap}
        style={[styles.name, { color: palette.ink }]}
        testID={`${testID}-name`}
      >
        {name}
      </Text>
      <MaterialCommunityIcons name="chevron-down" size={16} color={palette.textMuted} />
    </Pressable>
  );

  return (
    <View style={[variant === 'bar' ? styles.bar : null, style]}>
      {pill}
      {variant === 'bar' && away && home ? (
        <AwayLine
          homeName={homeName}
          onBack={() => select(home)}
          cap={cap}
          testID={`${testID}-away`}
          backTestID={`${testID}-home`}
        />
      ) : null}
      <RegionSheet
        visible={open}
        onClose={() => setOpen(false)}
        testID={`${testID}-sheet`}
        optionTestID={`${testID}-option`}
      />
    </View>
  );
}

/**
 * "Choose a region" (stage G, mockup screen 35): one row per platform region with the globe tile,
 * its name, a line ("Your region · Canada, United States, Mexico" for the collector's own, a few
 * countries for the others) and a radio; picking one closes the sheet. The footnote says where
 * one's own region comes from.
 */
export function RegionSheet({
  visible,
  onClose,
  testID = 'region-sheet',
  optionTestID,
}: {
  visible: boolean;
  onClose: () => void;
  testID?: string;
  optionTestID?: string;
}) {
  const { palette } = useTheme();
  const { region, home, select } = useBrowsingRegion();
  const options = useRegionOptions();
  const regions = useRegions(false).data?.regions;
  return (
    <RadioSheet
      visible={visible}
      onClose={onClose}
      title={REGION_COPY.sheetTitle}
      description={REGION_COPY.sheetIntro}
      groupLabel={REGION_COPY.groupLabel}
      footnote={REGION_COPY.footnote}
      value={region}
      onPick={select}
      testID={testID}
      optionTestID={optionTestID}
      options={options.map((option) => ({
        value: option.code,
        label: option.name,
        detail: regionLine(
          option.code,
          option.code === home,
          regions
            ?.find((entry) => entry.code === option.code)
            ?.countries?.map((country) => country.name ?? '')
        ),
        leading: (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[styles.globe, { backgroundColor: palette.accentContainer }]}
          >
            <MaterialCommunityIcons name="earth" size={20} color={palette.onAccentContainer} />
          </View>
        ),
      }))}
    />
  );
}

function AwayLine({
  homeName,
  onBack,
  cap,
  testID,
  backTestID,
}: {
  homeName: string;
  onBack: () => void;
  cap?: number;
  testID: string;
  backTestID: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.away} testID={testID}>
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={cap}
        style={[textStyle('sm'), styles.strong, { color: palette.ink }]}
      >
        {REGION_COPY.notYours}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={REGION_COPY.backTo(homeName)}
        onPress={onBack}
        hitSlop={8}
        testID={backTestID}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text
          maxFontSizeMultiplier={cap}
          style={[textStyle('sm'), styles.link, { color: palette.accent }]}
        >
          {REGION_COPY.backTo(homeName)}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * "Not your region. Back to {home}" alone, while another region than the collector's is browsed:
 * under the top row (Search's field, Home's pills), where the pill has no room for it.
 */
export function RegionAwayNote({ testID = 'region-away' }: { testID?: string }) {
  const { home, away, select } = useBrowsingRegion();
  const homeName =
    useRegionOptions().find((option) => option.code === home)?.name ?? regionName(home);
  if (!away || !home) {
    return null;
  }
  return (
    <AwayLine
      homeName={homeName}
      onBack={() => select(home)}
      cap={PINNED_MAX_FONT_SCALE}
      testID={testID}
      backTestID={`${testID}-home`}
    />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: spacing[1],
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: '100%',
  },
  name: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold, flexShrink: 1 },
  globe: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  away: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing[2] },
  strong: { fontWeight: fontWeight.semibold },
  back: { minHeight: 36, justifyContent: 'center' },
  link: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.7 },
});
