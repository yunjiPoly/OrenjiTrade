import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import type { IconName } from '@/src/components/ui/EmptyState';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Small building blocks shared by the offer and trade screens: the header, info pills, a banner
 * with one action, titled sections and the privacy note.
 */

export function DealHeader({
  eyebrow,
  title,
  testID,
}: {
  eyebrow: string;
  title: string;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <Text
        testID={`${testID}-eyebrow`}
        style={[textStyle('xs'), styles.eyebrow, { color: palette.textMuted }]}
      >
        {eyebrow}
      </Text>
      <Text
        accessibilityRole="header"
        testID={`${testID}-title`}
        style={[textStyle('2xl', 'heading'), styles.strong, { color: palette.ink }]}
      >
        {title}
      </Text>
    </View>
  );
}

export function Pill({ label, icon, testID }: { label: string; icon?: IconName; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: palette.surfaceVariant }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={14} color={palette.textMuted} /> : null}
      <Text style={[textStyle('xs'), styles.strong, { color: palette.ink }]}>{label}</Text>
    </View>
  );
}

export function Banner({
  icon,
  text,
  actionLabel,
  onAction,
  tone = 'info',
  testID,
}: {
  icon: IconName;
  text: string;
  actionLabel: string;
  onAction: () => void;
  tone?: 'info' | 'success';
  testID: string;
}) {
  const { palette } = useTheme();
  const color = tone === 'success' ? palette.success : palette.info;
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={[styles.banner, { borderColor: color, backgroundColor: palette.surface }]}
    >
      <View style={styles.row}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
        <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>{text}</Text>
      </View>
      <Button label={actionLabel} onPress={onAction} testID={`${testID}-action`} />
    </View>
  );
}

export function Section({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.section} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[textStyle('lg', 'heading'), styles.strong, { color: palette.ink }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function PrivacyNote({ text, testID }: { text: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <MaterialCommunityIcons name="shield-account-outline" size={18} color={palette.accent} />
      <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing[1] },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 0.5 },
  strong: { fontWeight: fontWeight.semibold },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  section: { gap: spacing[2] },
});
