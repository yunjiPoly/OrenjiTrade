import { StyleSheet, View } from 'react-native';

import { Checkbox } from '@/src/components/ui/FormControls';
import { Text } from '@/src/components/ui/Text';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

import { AGE_CONFIRMATION_ERROR, AGE_CONFIRMATION_LABEL_EN } from './ageConfirmation';

export interface AgeConfirmationCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Show the validation message (the parent sets it after a submit attempt). */
  showError?: boolean;
  disabled?: boolean;
  testID?: string;
}

/**
 * The 18+ confirmation (web: `app-age-confirmation-checkbox`) in its own card, as in mockup v50
 * (screens 37 and 43): never ticked by default, never part of "Accept all", English only (owner,
 * 2026-10-20). The parent records it server-side with `POST /me/consents` (`AGE_CONFIRMATION`).
 */
export function AgeConfirmationCheckbox({
  checked,
  onChange,
  showError = false,
  disabled,
  testID = 'age-confirmation',
}: AgeConfirmationCheckboxProps) {
  const { palette } = useTheme();
  const error = showError && !checked;
  return (
    <View
      style={[styles.card, { borderColor: error ? palette.danger : palette.borderStrong }]}
      testID={`${testID}-box`}
    >
      <Checkbox
        label={AGE_CONFIRMATION_LABEL_EN}
        checked={checked}
        onChange={onChange}
        error={error}
        disabled={disabled}
        testID={testID}
      >
        <Text style={[textStyle('sm'), { color: palette.ink }]}>{AGE_CONFIRMATION_LABEL_EN}</Text>
      </Checkbox>
      {error ? (
        <Text
          accessibilityRole="alert"
          testID={`${testID}-error`}
          style={[textStyle('sm'), styles.error, { color: palette.danger }]}
        >
          {AGE_CONFIRMATION_ERROR}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: spacing[1],
  },
  error: { paddingBottom: spacing[2] },
});
