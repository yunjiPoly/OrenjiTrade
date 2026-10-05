import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { SelectSheet } from '@/src/components/ui/SelectSheet';
import { MAP_PRIVACY_NOTE } from '@/src/lib/approximateArea';
import { CITY_PRESETS, type CityPreset } from '@/src/lib/location';
import { elevation, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** A floating card over the map. */
function NoticeCard({
  icon,
  title,
  children,
  testID,
  tone = 'default',
  role = 'summary',
}: {
  icon: IconName;
  title?: string;
  children?: ReactNode;
  testID: string;
  tone?: 'default' | 'warning';
  role?: 'summary' | 'alert';
}) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole={role}
      style={[
        styles.card,
        elevation.floating,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.row}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={tone === 'warning' ? palette.warning : palette.accent}
        />
        <View style={styles.grow}>
          {title ? (
            <Text style={[textStyle('sm'), styles.title, { color: palette.ink }]}>{title}</Text>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );
}

/** Why the zones are what they are (ADR 0004): always on the map. */
export function MapPrivacyNote() {
  const { palette } = useTheme();
  return (
    <View
      testID="map-approximate-note"
      style={[styles.pill, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <MaterialCommunityIcons name="shield-account-outline" size={16} color={palette.accent} />
      <Text style={[textStyle('xs'), styles.grow, { color: palette.ink }]}>{MAP_PRIVACY_NOTE}</Text>
    </View>
  );
}

/** The viewer is not discoverable (the default): others cannot find them. */
export function HiddenFromMapNotice({
  onOpenSettings,
  onDismiss,
}: {
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  return (
    <NoticeCard
      icon="eye-off-outline"
      title="You are hidden from the map"
      testID="map-hidden-notice"
    >
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        You can see collectors near you, but they cannot find you until you turn on “Show me on the
        map”.
      </Text>
      <View style={styles.actions}>
        <Button
          label="Location settings"
          variant="ghost"
          icon="cog-outline"
          onPress={onOpenSettings}
          testID="map-hidden-settings"
        />
        <Button label="Not now" variant="ghost" onPress={onDismiss} testID="map-hidden-dismiss" />
      </View>
    </NoticeCard>
  );
}

/** No trading area yet: the map shows a city (the web's `area-prompt`). */
export function AreaPrompt({
  city,
  onCity,
  onSetArea,
}: {
  city: CityPreset;
  onCity: (city: CityPreset) => void;
  onSetArea: () => void;
}) {
  const { palette } = useTheme();
  return (
    <NoticeCard icon="map-search-outline" testID="map-area-prompt">
      <Text style={[textStyle('sm'), { color: palette.ink }]}>
        Showing collectors around <Text style={styles.title}>{city.label}</Text>. Set your trading
        area to see collectors near you.
      </Text>
      <View style={styles.actions}>
        <SelectSheet
          compact
          label="City"
          options={CITY_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
          value={city.id}
          onChange={(id) => {
            const next = CITY_PRESETS.find((preset) => preset.id === id);
            if (next) {
              onCity(next);
            }
          }}
          testID="map-city"
        />
        <Button label="Set my area" onPress={onSetArea} testID="map-set-area" />
      </View>
    </NoticeCard>
  );
}

/** Nobody in range (or nobody with these filters). */
export function MapEmptyNotice({
  title,
  onClearFilters,
  inline = false,
}: {
  title: string;
  onClearFilters?: () => void;
  inline?: boolean;
}) {
  const { palette } = useTheme();
  const body = (
    <>
      <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
        {onClearFilters
          ? 'Try other filters or a larger distance.'
          : 'Zoom out, pan the map or choose a larger distance. New collectors join every week.'}
      </Text>
      {onClearFilters ? (
        <Button
          label="Clear filters"
          variant="ghost"
          icon="filter-remove-outline"
          onPress={onClearFilters}
          style={styles.action}
          testID="map-clear-filters"
        />
      ) : null}
    </>
  );
  if (inline) {
    return (
      <View testID="map-empty" accessibilityRole="summary" style={styles.inline}>
        <Text style={[textStyle('md'), styles.title, { color: palette.ink }]}>{title}</Text>
        {body}
      </View>
    );
  }
  return (
    <NoticeCard icon="account-search-outline" title={title} testID="map-empty">
      {body}
    </NoticeCard>
  );
}

/** The plan's radius cap answered `LIMIT_REACHED`: the map continues at the cap. */
export function RadiusLimitNotice({ radiusKm }: { radiusKm: number }) {
  const { palette } = useTheme();
  return (
    <NoticeCard icon="speedometer" testID="map-limit-notice" tone="warning">
      <Text style={[textStyle('sm'), { color: palette.ink }]}>
        Your plan shows collectors up to {radiusKm} km away. Premium raises it.
      </Text>
    </NoticeCard>
  );
}

/** A refresh failed: the last answer stays on the map. */
export function RefreshErrorNotice({ onRetry }: { onRetry: () => void }) {
  const { palette } = useTheme();
  return (
    <NoticeCard icon="cloud-off-outline" testID="map-refresh-error" tone="warning" role="alert">
      <Text style={[textStyle('sm'), { color: palette.ink }]}>
        Collectors could not refresh. You are seeing the last answer.
      </Text>
      <Button
        label="Retry"
        variant="ghost"
        icon="refresh"
        onPress={onRetry}
        style={styles.action}
        testID="map-refresh-retry"
      />
    </NoticeCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  row: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  grow: { flexShrink: 1, flexGrow: 1 },
  title: { fontWeight: fontWeight.semibold },
  action: { alignSelf: 'flex-start' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    alignSelf: 'center',
    maxWidth: '100%',
  },
  inline: { gap: spacing[2], paddingVertical: spacing[6], alignItems: 'center' },
});
