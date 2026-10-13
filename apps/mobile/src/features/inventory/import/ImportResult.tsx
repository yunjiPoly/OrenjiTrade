import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { InventoryImport } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { SectionCard } from '@/src/components/ui/Layout';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

import { formatCount, resultLines, resultSentence } from './importLabels';

export interface ImportResultProps {
  preview: InventoryImport;
  onInventory: () => void;
  onAnother: () => void;
}

/**
 * What a commit did: new cards added, cards already owned that got more copies, lines left out
 * (and why), and the way to the inventory. Reading it again, or committing again, shows the same.
 */
export function ImportResult({ preview, onInventory, onAnother }: ImportResultProps) {
  const { palette } = useTheme();
  return (
    <View style={styles.root} testID="import-result">
      <View style={styles.head}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={28}
          color={palette.success}
          accessibilityElementsHidden
        />
        <Text
          accessibilityRole="header"
          style={[textStyle('xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          Import done
        </Text>
      </View>
      <SectionCard>
        {resultLines(preview).map((line) => (
          <View
            key={line.key}
            accessible
            accessibilityLabel={`${formatCount(line.value)} ${line.label}${line.detail ? `: ${line.detail}` : ''}`}
            testID={`import-result-${line.key}`}
            style={styles.line}
          >
            <Text style={[textStyle('xl', 'heading'), styles.value, { color: palette.ink }]}>
              {formatCount(line.value)}
            </Text>
            <View style={styles.grow}>
              <Text style={[textStyle('md'), { color: palette.ink }]}>{line.label}</Text>
              {line.detail ? (
                <Text style={[textStyle('sm'), { color: palette.textMuted }]}>{line.detail}</Text>
              ) : null}
            </View>
          </View>
        ))}
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="import-result-note">
          {resultSentence(preview.result)}
        </Text>
      </SectionCard>
      <Button
        label="Go to my inventory"
        icon="cards-outline"
        onPress={onInventory}
        testID="import-result-inventory"
      />
      <Button
        label="Import another file"
        variant="ghost"
        onPress={onAnother}
        testID="import-result-another"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title: { fontWeight: fontWeight.semibold, flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  value: { fontWeight: fontWeight.bold, minWidth: 48, textAlign: 'right' },
  grow: { flex: 1 },
});
