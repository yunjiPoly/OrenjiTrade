import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { blockerLabel, useRequestDeletion } from '@/src/api/hooks/account';
import { WRONG_PASSWORD_CODES, authErrorMessage, toAuthError } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { Checkbox, FormMessage, PasswordField } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { TextField } from '@/src/components/ui/TextField';
import { exportMyData } from '@/src/features/account/exportData';
import { spacing, textStyle, useTheme } from '@/src/theme';

const FACTS = [
  {
    icon: 'clock-outline' as const,
    text: 'Your account is deleted after a 7-day grace period. You can cancel any time before that.',
  },
  {
    icon: 'eye-off-outline' as const,
    text: 'You disappear from the map and search right away.',
  },
  {
    icon: 'gavel' as const,
    text: 'Consent records and audit entries are kept as required by law.',
  },
];

type Step = 'form' | 'working' | 'blocked';

/**
 * Account deletion (web: the delete-account dialog): explains the 7-day grace period, optionally
 * exports first, re-authenticates with the password (the API needs a sign-in younger than five
 * minutes), confirms, then files `POST /me/deletion-requests`. The gate then shows the account
 * status screen with "Cancel deletion".
 */
export default function DeleteAccountScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const session = useSession();
  const account = useAccount();
  const request = useRequestDeletion();
  const [reason, setReason] = useState('');
  const [exportFirst, setExportFirst] = useState(true);
  const [password, setPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);

  const passwordError = submitted && !password ? 'Enter your password to continue.' : null;
  const acknowledgeError = submitted && !acknowledged;

  const review = () => {
    setSubmitted(true);
    if (!password || !acknowledged) {
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setConfirming(false);
    setError(null);
    setStep('working');
    try {
      setStatus('Confirming it is you…');
      await session.reauthenticate(password);
      if (exportFirst) {
        setStatus('Preparing your data export…');
        await exportMyData(account.handle);
      }
      setStatus('Scheduling the deletion…');
      await request.mutateAsync({ reason: reason.trim() || null, exportFirst });
      await account.reload();
      // The gate moves to the account status screen (deletion pending).
    } catch (caught) {
      if (isApiError(caught) && caught.errorCode === 'DELETION_BLOCKED') {
        setBlockers(caught.problem?.blockers ?? []);
        setStep('blocked');
        return;
      }
      setStep('form');
      if (isApiError(caught)) {
        setError(friendlyMessage(caught));
      } else if (WRONG_PASSWORD_CODES.has(toAuthError(caught).code)) {
        setError('That password is not correct.');
        setPassword('');
      } else {
        setError(authErrorMessage(caught));
      }
    }
  };

  if (step === 'blocked') {
    return (
      <Screen scroll safeBottom testID="screen-delete-account">
        <View style={styles.root}>
          <FormMessage>
            Your account cannot be deleted yet. Please resolve the following first:
          </FormMessage>
          {(blockers.length > 0 ? blockers : ['SOME_OBLIGATIONS']).map((blocker) => (
            <Text key={blocker} style={[textStyle('md'), { color: palette.ink }]}>
              •{' '}
              {blocker === 'SOME_OBLIGATIONS'
                ? 'Some obligations are still open.'
                : blockerLabel(blocker)}
            </Text>
          ))}
          <Button label="Close" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (step === 'working') {
    return (
      <Screen safeBottom testID="screen-delete-account">
        <View style={styles.working} accessibilityLiveRegion="polite">
          <Button label={status} loading loadingLabel={status} variant="secondary" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll safeBottom testID="screen-delete-account">
      <View style={styles.root}>
        <Text
          accessibilityRole="header"
          style={[textStyle('2xl', 'heading'), { color: palette.ink }]}
        >
          Delete your account
        </Text>
        {FACTS.map((fact) => (
          <View key={fact.icon} style={styles.fact}>
            <MaterialCommunityIcons name={fact.icon} size={20} color={palette.textMuted} />
            <Text style={[textStyle('md'), styles.grow, { color: palette.ink }]}>{fact.text}</Text>
          </View>
        ))}
        {error ? <FormMessage testID="delete-error">{error}</FormMessage> : null}
        <TextField
          label="Why are you leaving? (optional)"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          testID="delete-reason"
        />
        <Checkbox
          label="Download a copy of my data first"
          checked={exportFirst}
          onChange={setExportFirst}
          testID="delete-export-first"
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          hint="For your security, confirm your password."
          autoComplete="current-password"
          textContentType="password"
          testID="delete-password"
        />
        <Checkbox
          label="I understand that my profile, tags and location will be permanently deleted."
          checked={acknowledged}
          onChange={setAcknowledged}
          error={acknowledgeError}
          testID="delete-acknowledge"
        />
        {acknowledgeError ? (
          <Text accessibilityRole="alert" style={[textStyle('sm'), { color: palette.danger }]}>
            Please confirm to continue.
          </Text>
        ) : null}
        <Button
          label="Delete my account"
          variant="danger"
          onPress={review}
          testID="delete-submit"
        />
        <Button label="Keep my account" variant="ghost" onPress={() => router.back()} />
      </View>
      <ConfirmDialog
        visible={confirming}
        title="Delete your account?"
        message="You will be hidden right away and your account is deleted in 7 days unless you cancel."
        confirmLabel="Delete my account"
        cancelLabel="Keep my account"
        tone="danger"
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
        testID="delete-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  fact: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  grow: { flex: 1 },
  working: { flex: 1, justifyContent: 'center' },
});
