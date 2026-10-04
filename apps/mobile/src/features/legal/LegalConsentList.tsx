import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Checkbox } from '@/src/components/ui/FormControls';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import type { ConsentItem } from './legalDocs';

export interface LegalConsentListProps {
  items: readonly ConsentItem[];
  /** `documentType`s ticked so far. */
  accepted: readonly string[];
  onChange: (accepted: string[]) => void;
  /** Show the inline "accept every document" error. */
  showError: boolean;
  testID?: string;
}

/**
 * One checkbox per legal document to accept, each with a link to read the versioned text in-app,
 * plus "Accept all" (same names as the web's `app-legal-consent-list`).
 */
export function LegalConsentList({
  items,
  accepted,
  onChange,
  showError,
  testID = 'legal-consents',
}: LegalConsentListProps) {
  const { palette } = useTheme();
  const router = useRouter();
  const allAccepted =
    items.length > 0 && items.every((item) => accepted.includes(item.documentType));
  const missing = showError && !allAccepted;

  const toggle = (documentType: string, checked: boolean) => {
    onChange(
      checked
        ? [...new Set([...accepted, documentType])]
        : accepted.filter((type) => type !== documentType)
    );
  };

  return (
    <View style={styles.list} testID={testID} accessibilityRole="list">
      <Checkbox
        label="Accept all"
        checked={allAccepted}
        onChange={(checked) => onChange(checked ? items.map((item) => item.documentType) : [])}
        error={missing}
        testID={`${testID}-all`}
      />
      {items.map((item) => (
        <View key={item.documentType} style={styles.item}>
          <Checkbox
            label={`I have read and accept the ${item.title}`}
            checked={accepted.includes(item.documentType)}
            onChange={(checked) => toggle(item.documentType, checked)}
            error={missing && !accepted.includes(item.documentType)}
            testID={`${testID}-${item.documentType}`}
          >
            <Text style={[textStyle('sm'), { color: palette.ink }]}>
              I have read and accept the <Text style={styles.strong}>{item.title}</Text>
            </Text>
          </Checkbox>
          {item.key ? (
            <Text
              accessibilityRole="link"
              accessibilityLabel={`Read the ${item.title}`}
              onPress={() =>
                router.push({ pathname: '/legal/[key]', params: { key: item.key ?? '' } })
              }
              style={[textStyle('sm'), styles.link, { color: palette.accent }]}
            >
              Read (version {item.version})
            </Text>
          ) : null}
        </View>
      ))}
      {missing ? (
        <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
          Please accept every document to continue.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  item: { gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  link: { marginLeft: 36, fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
});
