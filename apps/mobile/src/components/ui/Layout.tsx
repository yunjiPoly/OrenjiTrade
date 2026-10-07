import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme, type ViewStyleProp } from '@/src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface SectionCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  style?: ViewStyleProp;
  testID?: string;
}

/** A titled card grouping related settings or profile details (web: `app-section-card`). */
export function SectionCard({ title, description, children, style, testID }: SectionCardProps) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {title ? (
        <Text
          accessibilityRole="header"
          style={[textStyle('lg', 'heading'), styles.title, { color: palette.ink }]}
        >
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{description}</Text>
      ) : null}
      {children}
    </View>
  );
}

export interface ListRowProps {
  label: string;
  /** Secondary line (current value, explanation). */
  detail?: string | null;
  icon?: IconName;
  onPress?: () => void;
  /** `link` rows navigate (chevron); `button` rows act in place. */
  kind?: 'link' | 'button';
  tone?: 'default' | 'danger';
  testID?: string;
}

/** A tappable row of a settings list. */
export function ListRow({
  label,
  detail,
  icon,
  onPress,
  kind = 'link',
  tone = 'default',
  testID,
}: ListRowProps) {
  const { palette } = useTheme();
  const color = tone === 'danger' ? palette.danger : palette.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind === 'link' ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={detail ?? undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={tone === 'danger' ? palette.danger : palette.textMuted}
        />
      ) : null}
      <View style={styles.grow}>
        <Text style={[textStyle('md'), styles.rowLabel, { color }]}>{label}</Text>
        {detail ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{detail}</Text>
        ) : null}
      </View>
      {kind === 'link' ? (
        <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textDisabled} />
      ) : null}
    </Pressable>
  );
}

export function Divider() {
  const { palette } = useTheme();
  return <View style={[styles.divider, { backgroundColor: palette.border }]} />;
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

/** Heading block at the top of a screen (the h1 of the page on web). */
export function ScreenHeader({ title, subtitle, eyebrow }: ScreenHeaderProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      {eyebrow ? (
        <Text style={[textStyle('sm'), styles.eyebrow, { color: palette.primary }]}>{eyebrow}</Text>
      ) : null}
      <Text
        accessibilityRole="header"
        style={[textStyle('2xl', 'heading'), styles.headerTitle, { color: palette.ink }]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export interface ChipListProps {
  items: readonly string[];
  emptyLabel?: string;
  testID?: string;
}

/** Read-only chips (games, languages, tags on a profile). */
export function ChipList({ items, emptyLabel = 'None yet', testID }: ChipListProps) {
  const { palette } = useTheme();
  if (items.length === 0) {
    return <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{emptyLabel}</Text>;
  }
  return (
    <View style={styles.chips} testID={testID}>
      {items.map((item) => (
        <View key={item} style={[styles.chip, { backgroundColor: palette.surfaceVariant }]}>
          <Text style={[textStyle('sm'), { color: palette.ink }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], gap: spacing[3] },
  title: { fontWeight: fontWeight.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 52,
    paddingVertical: spacing[2],
  },
  rowLabel: { fontWeight: fontWeight.medium },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  divider: { height: StyleSheet.hairlineWidth },
  header: { gap: spacing[1], marginBottom: spacing[5] },
  eyebrow: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  headerTitle: { fontWeight: fontWeight.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
});
