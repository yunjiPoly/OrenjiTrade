import { StyleSheet, View } from 'react-native';

import { useCollectorProfile } from '@/src/api/hooks/collectors';
import { Avatar } from '@/src/components/ui/Avatar';
import { Text } from '@/src/components/ui/Text';
import { LABEL_MAX_FONT_SCALE } from '@/src/features/settings/SettingsList';
import { fontWeight, useStackedRows, useTheme } from '@/src/theme';
import { HandleText } from '@/src/components/ui/HandleText';

/** "@fake.cards · Ontario", or the handle alone while the province is unknown or not shown. */
export function personLine(handle: string | null, province: string | null | undefined): string {
  return [handle ? `@${handle}` : null, province || null].filter(Boolean).join(' · ');
}

export interface PersonHeaderProps {
  displayName: string;
  handle: string | null;
  /** The picture the entry point knew; the public profile's when it has one. */
  avatarUrl?: string | null;
  /**
   * The line under the name instead of "@handle · {province}" (the rating form's deal: "Ash
   * Blossom & Joyous Spring · sold to you Oct 17").
   */
  line?: string | null;
  /** The name's own id (the flows read it); `<testID>-name` by default. */
  nameTestID?: string;
  testID?: string;
}

/**
 * The collector a report, a rating or a reference is about (mockup v50 screens 60 to 62): a 48 pt
 * avatar, the name and one line, "@handle · {province}". The picture and the province come from
 * the collector's public profile as the caller may see it (`GET /collectors/{handle}`: the
 * province of a discoverable collector only, never the city here, ADR 0017); while it loads, or
 * when it cannot be read (a private profile, a block), the name and the handle stand alone.
 */
export function PersonHeader({
  displayName,
  handle,
  avatarUrl,
  line,
  nameTestID,
  testID = 'person-header',
}: PersonHeaderProps) {
  const { palette } = useTheme();
  // At the largest text sizes the picture goes above the words, which take the whole width and
  // follow the text size up to 2.5 times, so a handle stays whole (stage R13's rule for rows).
  const stacked = useStackedRows();
  const profile = useCollectorProfile(handle);
  const province = profile.data?.location?.subdivisionName ?? null;
  const shown = line ?? personLine(handle, province);
  return (
    // The name and the line stay two elements for VoiceOver (and the flows read the name by its
    // id): a grouped row would hide them.
    <View style={[styles.row, stacked && styles.stacked]} testID={testID}>
      <Avatar src={profile.data?.avatarUrl ?? avatarUrl} name={displayName} size={48} />
      <View style={[styles.words, stacked && styles.wordsStacked]}>
        <Text
          maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
          style={[styles.name, { color: palette.ink }]}
          testID={nameTestID ?? `${testID}-name`}
        >
          {displayName}
        </Text>
        {shown ? (
          <HandleText
            numberOfLines={2}
            style={[styles.line, { color: palette.textMuted }]}
            testID={`${testID}-line`}
          >
            {shown}
          </HandleText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  wordsStacked: { flex: 0, alignSelf: 'stretch' },
  name: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.semibold },
  line: { fontSize: 13, lineHeight: 18 },
});
