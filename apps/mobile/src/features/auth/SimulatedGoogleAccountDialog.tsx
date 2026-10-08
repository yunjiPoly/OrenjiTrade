import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormDialog } from '@/src/components/ui/FormDialog';
import { FormMessage } from '@/src/components/ui/FormControls';
import { TextField } from '@/src/components/ui/TextField';
import { spacing, textStyle, useTheme } from '@/src/theme';

import { validateSimulatedAccount, type SimulatedAccountErrors } from './googleStrategy';
import type { SimulatedAccountDialogState } from './useGoogleSignIn';

/**
 * The simulated Google account of the local Auth emulator (which has no Google): the collector
 * picks the e-mail and the name Google would have returned; the emulator treats the e-mail as
 * verified. Only ever shown against the emulator (`googleStrategy` = `emulator`).
 */
export function SimulatedGoogleAccountDialog({
  visible,
  lockedEmail,
  onSubmit,
  onCancel,
}: SimulatedAccountDialogState) {
  const { palette } = useTheme();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<SimulatedAccountErrors>({ email: null, displayName: null });
  const address = lockedEmail ?? email;

  const submit = () => {
    const checked = validateSimulatedAccount(address, displayName);
    setErrors(checked.errors);
    if (checked.valid) {
      onSubmit(address.trim(), displayName.trim());
      setErrors({ email: null, displayName: null });
    }
  };

  return (
    <FormDialog
      visible={visible}
      title="Simulated Google account"
      message="This build talks to the local Auth emulator, which has no Google. Choose the Google account to simulate; its e-mail counts as verified."
      confirmLabel="Continue"
      onConfirm={submit}
      onCancel={onCancel}
      testID="google-dialog"
    >
      <View style={styles.fields}>
        <FormMessage tone="info">Local emulator only. Nothing reaches Google.</FormMessage>
        {lockedEmail ? (
          <View>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>Google account</Text>
            <Text testID="google-locked-email" style={[textStyle('md'), { color: palette.ink }]}>
              {lockedEmail}
            </Text>
          </View>
        ) : (
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            testID="google-email"
          />
        )}
        <TextField
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
          hint="The name Google would show."
          maxLength={80}
          onSubmitEditing={submit}
          testID="google-name"
        />
      </View>
    </FormDialog>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing[3] },
});
