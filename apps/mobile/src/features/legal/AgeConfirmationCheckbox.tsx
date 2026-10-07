import { StyleSheet, Text, View } from 'react-native';

import { Checkbox } from '@/src/components/ui/FormControls';
import { radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  AGE_CONFIRMATION_ERROR,
  AGE_CONFIRMATION_ERROR_FR,
  AGE_CONFIRMATION_LABEL_EN,
  AGE_CONFIRMATION_LABEL_FR,
} from './ageConfirmation';

export interface AgeConfirmationCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Show the validation message (the parent sets it after a submit attempt). */
  showError: boolean;
  disabled?: boolean;
  testID?: string;
}

/**
 * The 18+ confirmation checkbox (web: `app-age-confirmation-checkbox`): never ticked by default,
 * never part of "Accept all", labelled in English and French; the parent records the
 * confirmation server-side with `POST /me/consents` (`AGE_CONFIRMATION`).
 */
export function AgeConfirmationCheckbox({
  checked,
  onChange,
  showError,
  disabled,
  testID = 'age-confirmation',
}: AgeConfirmationCheckboxProps) {
  const { palette } = useTheme();
  const error = showError && !checked;
  return (
    <View
      style={[
        styles.box,
        { borderColor: error ? palette.danger : palette.border, backgroundColor: palette.surface },
      ]}
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
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          {AGE_CONFIRMATION_LABEL_FR}
        </Text>
      </Checkbox>
      {error ? (
        <View accessibilityRole="alert" testID={`${testID}-error`} style={styles.error}>
          <Text style={[textStyle('sm'), { color: palette.danger }]}>{AGE_CONFIRMATION_ERROR}</Text>
          <Text style={[textStyle('sm'), { color: palette.danger }]}>
            {AGE_CONFIRMATION_ERROR_FR}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md, padding: spacing[2], gap: spacing[1] },
  error: { paddingHorizontal: spacing[2], paddingBottom: spacing[1], gap: 2 },
});
