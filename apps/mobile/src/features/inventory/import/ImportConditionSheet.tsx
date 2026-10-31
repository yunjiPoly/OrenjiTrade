import { ScrollView, StyleSheet } from 'react-native';

import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { ListRow } from '@/src/components/ui/Layout';
import { CARD_CONDITIONS, conditionLabel } from '@/src/lib/inventory';

export interface ImportConditionSheetProps {
  visible: boolean;
  /** The conditions offered (the six usual ones while the games are unknown). */
  conditions: readonly string[] | undefined;
  onChoose: (condition: string) => void;
  onClose: () => void;
}

/**
 * One condition for every line whose file names none (`SET_CONDITION`): a file without conditions
 * starts at the lowest grade, and a whole deck is rarely "Damaged". Lines whose condition the
 * collector already set are left alone.
 */
export function ImportConditionSheet({
  visible,
  conditions,
  onChoose,
  onClose,
}: ImportConditionSheetProps) {
  const options = conditions?.length ? conditions : CARD_CONDITIONS;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Condition of the cards your file gives none for"
      testID="import-condition-sheet"
    >
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {options.map((condition) => (
          <ListRow
            key={condition}
            icon="shield-check-outline"
            label={conditionLabel(condition)}
            kind="button"
            onPress={() => onChoose(condition)}
            testID={`import-condition-${condition}`}
          />
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
});
