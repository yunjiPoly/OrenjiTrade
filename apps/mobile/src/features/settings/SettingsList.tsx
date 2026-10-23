import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import { SWITCH_THUMB } from '@/src/components/ui/FormControls';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, radius, spacing, useStackedRows, useTheme } from '@/src/theme';

export type SettingsIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface SettingsGroupProps {
  /** The small uppercase heading above the card ("Where you ship from"). */
  title?: string;
  /** A quiet line under the card ("Turn a channel off to silence it everywhere."). */
  footnote?: string | null;
  children: ReactNode;
  /** `radiogroup`: the card is the group of its radio rows, named by `title`. */
  role?: 'radiogroup';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A group of Settings (mockup v50 screens 47 to 59): its heading, a rounded card whose rows are
 * parted by hairlines, an optional line under it.
 */
export function SettingsGroup({
  title,
  footnote,
  children,
  role,
  style,
  testID,
}: SettingsGroupProps) {
  const { palette } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]} testID={testID}>
      {title ? <GroupTitle>{title}</GroupTitle> : null}
      <View
        accessibilityRole={role}
        accessibilityLabel={role ? title : undefined}
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        {rows.map((row, index) => (
          <View
            key={row.key ?? index}
            style={index > 0 ? [styles.parted, { borderTopColor: palette.border }] : undefined}
          >
            {row}
          </View>
        ))}
      </View>
      {footnote ? (
        <Text style={[styles.footnote, { color: palette.textMuted }]}>{footnote}</Text>
      ) : null}
    </View>
  );
}

/** A group's small uppercase heading; a screen reader reads it as written. */
export function GroupTitle({ children }: { children: string }) {
  const { palette } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel={children}
      style={[styles.groupTitle, { color: palette.textMuted }]}
    >
      {children.toUpperCase()}
    </Text>
  );
}

export interface SettingsRowProps {
  label: string;
  /** The line under the label ("Quebec, Canada · On the map"). */
  detail?: string | null;
  /** The value at the right end ("Dark", "2", "1 waiting"). */
  value?: string | null;
  /** The value is still loading: a short skeleton in its place. */
  valueLoading?: boolean;
  icon?: SettingsIcon;
  onPress?: () => void;
  /** `link` rows open a page (chevron); `button` rows act in place; `info` rows only show. */
  kind?: 'link' | 'button' | 'info';
  tone?: 'default' | 'danger';
  /** Something at the right end instead of a value (a "Verified" pill). */
  trailing?: ReactNode;
  testID?: string;
}

/**
 * A row of a Settings group: an icon, the label and its line, a value and a chevron. The value
 * and the line are what a screen reader says after the label; at the largest text sizes the value
 * goes under the label.
 */
export function SettingsRow({
  label,
  detail,
  value,
  valueLoading = false,
  icon,
  onPress,
  kind = 'link',
  tone = 'default',
  trailing,
  testID,
}: SettingsRowProps) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  const danger = tone === 'danger';
  const spoken = [detail, value].filter((part): part is string => !!part).join(', ');
  const body = (
    <>
      {icon ? (
        <View style={styles.iconSlot}>
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={danger ? palette.danger : palette.settings.rowIcon}
          />
        </View>
      ) : null}
      <View style={styles.words}>
        <Text style={[styles.label, { color: danger ? palette.danger : palette.ink }]}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.detail, { color: palette.textMuted }]}>{detail}</Text>
        ) : null}
        {stacked && value ? (
          <Text style={[styles.detail, { color: palette.textMuted }]}>{value}</Text>
        ) : null}
      </View>
      {!stacked && value ? (
        <Text numberOfLines={1} style={[styles.value, { color: palette.textMuted }]}>
          {value}
        </Text>
      ) : null}
      {valueLoading && !value ? <Skeleton width={36} height={14} /> : null}
      {trailing}
      {kind === 'link' ? (
        <MaterialCommunityIcons name="chevron-right" size={18} color={palette.settings.chevron} />
      ) : null}
    </>
  );
  if (kind === 'info' || !onPress) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        accessibilityValue={spoken ? { text: spoken } : undefined}
        style={styles.row}
        testID={testID}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={kind === 'link' ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityValue={spoken ? { text: spoken } : undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export interface SettingsSwitchProps {
  label: string;
  /** The line under the label; a screen reader says it after the switch's state. */
  help?: string | null;
  /** The line's own id (tests read what it says). */
  helpTestID?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  icon?: SettingsIcon;
  disabled?: boolean;
  testID?: string;
}

/**
 * A switch row of a Settings group. The row is the control (`role=switch`, its label as name, the
 * line as hint); the visual switch is hidden from screen readers. At the largest text sizes the
 * switch goes under the words.
 */
export function SettingsSwitch({
  label,
  help,
  helpTestID,
  value,
  onChange,
  icon,
  disabled,
  testID,
}: SettingsSwitchProps) {
  const { palette } = useTheme();
  const stacked = useStackedRows();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={help ?? undefined}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.stackedRow,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.lead, !stacked && styles.grow]}>
        {icon ? (
          <View style={styles.iconSlot}>
            <MaterialCommunityIcons name={icon} size={20} color={palette.settings.rowIcon} />
          </View>
        ) : null}
        <View style={styles.words}>
          <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
          {help ? (
            <Text testID={helpTestID} style={[styles.detail, { color: palette.textMuted }]}>
              {help}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Switch
          value={value}
          disabled={disabled}
          trackColor={{ true: palette.primary, false: palette.borderStrong }}
          thumbColor={SWITCH_THUMB}
        />
      </View>
    </Pressable>
  );
}

export interface SettingsRadioOption<T extends string> {
  value: T;
  label: string;
  help?: string;
}

export interface SettingsRadiosProps<T extends string> {
  /** The group's heading and name ("Who can see your profile"). */
  title: string;
  options: readonly SettingsRadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  footnote?: string | null;
  /** Each option is `<testID>-<value>`. */
  testID?: string;
}

/** A group of radio rows (mockup v50: the words on the left, the ring on the right). */
export function SettingsRadios<T extends string>({
  title,
  options,
  value,
  onChange,
  disabled,
  footnote,
  testID,
}: SettingsRadiosProps<T>) {
  const { palette } = useTheme();
  return (
    <SettingsGroup title={title} role="radiogroup" footnote={footnote} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.help}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.words}>
              <Text style={[styles.label, { color: palette.ink }]}>{option.label}</Text>
              {option.help ? (
                <Text style={[styles.detail, { color: palette.textMuted }]}>{option.help}</Text>
              ) : null}
            </View>
            <View
              style={[
                styles.ring,
                { borderColor: selected ? palette.primary : palette.textDisabled },
              ]}
            >
              {selected ? (
                <View style={[styles.dot, { backgroundColor: palette.primary }]} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </SettingsGroup>
  );
}

export type PillTone = 'open' | 'review' | 'done' | 'closed';

/** A small status pill ("Open" amber, "Under review", "Action taken" teal, "Dismissed" grey). */
export function StatusPill({
  label,
  tone,
  testID,
}: {
  label: string;
  tone: PillTone;
  testID?: string;
}) {
  const { palette } = useTheme();
  const colors = {
    open: [palette.settings.pillOpenBackground, palette.settings.pillOpenText],
    review: [palette.settings.pillReviewBackground, palette.settings.pillReviewText],
    done: [palette.settings.pillDoneBackground, palette.settings.pillDoneText],
    closed: [palette.settings.pillClosedBackground, palette.settings.pillClosedText],
  }[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: colors[0] }]}>
      <Text style={[styles.pillText, { color: colors[1] }]}>{label}</Text>
    </View>
  );
}

export interface SettingsNoteProps {
  /** The words; a `strong` part is said in the ink colour ("on this phone only"). */
  children: ReactNode;
  icon?: SettingsIcon;
  /** `teal`: what stays private (Shipping details); `draft`: the legal draft banner (amber). */
  tone?: 'teal' | 'draft';
  testID?: string;
}

/** A tinted note with an icon (mockup v50: Shipping details' note, Legal's draft banner). */
export function SettingsNote({
  children,
  icon = 'shield-check-outline',
  tone = 'teal',
  testID,
}: SettingsNoteProps) {
  const { palette } = useTheme();
  const colors =
    tone === 'draft'
      ? {
          background: palette.settings.draftBackground,
          border: palette.settings.draftBorder,
          text: palette.settings.draftText,
          icon: palette.settings.draftIcon,
        }
      : {
          background: palette.settings.noteBackground,
          border: palette.settings.noteBorder,
          text: palette.settings.noteText,
          icon: palette.settings.noteIcon,
        };
  return (
    <View
      accessible
      testID={testID}
      style={[styles.note, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={colors.icon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.grow}>
        {typeof children === 'string' ? (
          <Text style={[styles.noteText, { color: colors.text }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** The text style of a note's words, for notes that hold more than a string. */
export function useNoteTextStyle(tone: 'teal' | 'draft' = 'teal') {
  const { palette } = useTheme();
  return [
    styles.noteText,
    { color: tone === 'draft' ? palette.settings.draftText : palette.settings.noteText },
  ];
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  groupTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
  },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  parted: { borderTopWidth: 1 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 54,
    paddingVertical: spacing[2],
    paddingHorizontal: 14,
  },
  stackedRow: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing[2] },
  lead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconSlot: { width: 22, alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  grow: { flex: 1 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.medium },
  detail: { fontSize: 13, lineHeight: 18 },
  value: { flexShrink: 0, maxWidth: 150, fontSize: 14, lineHeight: 19 },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pillText: { fontSize: 11, lineHeight: 15, fontWeight: fontWeight.bold },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: spacing[3],
    borderRadius: 14,
    borderWidth: 1,
  },
  noteText: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
