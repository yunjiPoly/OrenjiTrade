import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Checkbox } from '@/src/components/ui/FormControls';
import { Text } from '@/src/components/ui/Text';
import { fontWeight, radius, spacing, textStyle, useStackedRows, useTheme } from '@/src/theme';

import type { ConsentItem } from './legalDocs';

export interface LegalConsentListProps {
  items: readonly ConsentItem[];
  /** `documentType`s ticked so far. */
  accepted: readonly string[];
  onChange: (accepted: string[]) => void;
  /** "Accept all" as the card's first row (sign-up; Review our terms when many are due). */
  acceptAll?: boolean;
  /**
   * `accept`: "I accept the Terms of Service" (sign-up, screen 37); `version`: the title and
   * "Version {version}" under it (Review our terms, screen 43).
   */
  rows?: 'accept' | 'version';
  testID?: string;
}

/** What a row of the card says, and what a screen reader says for its box. */
export function consentRowLabel(
  item: Pick<ConsentItem, 'title' | 'version'>,
  rows: 'accept' | 'version'
): { line: string; detail: string | null; name: string } {
  return rows === 'accept'
    ? { line: `I accept the ${item.title}`, detail: null, name: `I accept the ${item.title}` }
    : {
        line: item.title,
        detail: `Version ${item.version}`,
        name: `I accept the ${item.title}, version ${item.version}`,
      };
}

/**
 * The legal documents to accept in one card (mockup v50, screens 37 and 43): "Accept all" first
 * when asked for, then one row per document with its box and "Read", which opens the versioned
 * text in-app (same names as the web's `app-legal-consent-list`). "Accept all" never ticks the 18+
 * confirmation, which has its own card.
 */
export function LegalConsentList({
  items,
  accepted,
  onChange,
  acceptAll = true,
  rows = 'accept',
  testID = 'legal-consents',
}: LegalConsentListProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const stacked = useStackedRows();
  const allAccepted =
    items.length > 0 && items.every((item) => accepted.includes(item.documentType));

  const toggle = (documentType: string, checked: boolean) => {
    onChange(
      checked
        ? [...new Set([...accepted, documentType])]
        : accepted.filter((type) => type !== documentType)
    );
  };

  return (
    <View
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      testID={testID}
      accessibilityRole="list"
    >
      {acceptAll ? (
        <View style={styles.allRow}>
          <Checkbox
            label="Accept all"
            checked={allAccepted}
            onChange={(checked) => onChange(checked ? items.map((item) => item.documentType) : [])}
            testID={`${testID}-all`}
          >
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>Accept all</Text>
          </Checkbox>
        </View>
      ) : null}
      {items.map((item, index) => {
        const label = consentRowLabel(item, rows);
        return (
          <View
            key={item.documentType}
            style={[
              styles.row,
              stacked && styles.rowStacked,
              (acceptAll || index > 0) && { borderTopWidth: 1, borderTopColor: palette.border },
            ]}
          >
            <View style={stacked ? undefined : styles.box}>
              <Checkbox
                label={label.name}
                checked={accepted.includes(item.documentType)}
                onChange={(checked) => toggle(item.documentType, checked)}
                testID={`${testID}-${item.documentType}`}
              >
                <Text style={[textStyle('sm'), { color: palette.ink }]}>{label.line}</Text>
                {label.detail ? (
                  <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                    {label.detail}
                  </Text>
                ) : null}
              </Checkbox>
            </View>
            {item.key ? (
              <Text
                accessibilityRole="link"
                accessibilityLabel={`Read the ${item.title}`}
                onPress={() =>
                  router.push({ pathname: '/legal/[key]', params: { key: item.key ?? '' } })
                }
                style={[
                  textStyle('sm'),
                  styles.read,
                  stacked && styles.readStacked,
                  { color: palette.accent },
                ]}
                testID={`${testID}-${item.documentType}-read`}
              >
                Read
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  allRow: { paddingHorizontal: 14, paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingLeft: 14,
    paddingRight: spacing[3],
    paddingVertical: 2,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 0 },
  box: { flex: 1, minWidth: 0 },
  strong: { fontWeight: fontWeight.semibold },
  read: { fontSize: 13, fontWeight: fontWeight.semibold, paddingVertical: spacing[3] },
  readStacked: { alignSelf: 'flex-start', marginLeft: 36, paddingTop: 0 },
});
