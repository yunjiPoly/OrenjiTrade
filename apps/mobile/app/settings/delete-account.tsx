import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { blockerLabel, useRequestDeletion } from '@/src/api/hooks/account';
import { WRONG_PASSWORD_CODES, authErrorMessage, toAuthError } from '@/src/auth/authErrors';
import { useSession } from '@/src/auth/session';
import { Checkbox, FormMessage, PasswordField } from '@/src/components/ui/FormControls';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { exportMyData } from '@/src/features/account/exportData';
import { SimulatedGoogleAccountDialog } from '@/src/features/auth/SimulatedGoogleAccountDialog';
import { googleErrorMessage, useGoogleSignIn } from '@/src/features/auth/useGoogleSignIn';
import { DELETE_ACCOUNT_COPY as COPY } from '@/src/features/settings/settingsCopy';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { deleteSavedDetails } from '@/src/features/shipping/savedDetails';
import { fontWeight, PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

const REASON_MAX = 500;

type Step = 'form' | 'working' | 'blocked';
type WorkingStep = keyof typeof COPY.steps;

/**
 * Delete account (stage R13, mockup v50 screen 57; web: the delete-account dialog): what happens
 * (7 days to change one's mind, hidden at once, records kept by law), why one leaves (optional),
 * "Download a copy of my data first", the password (or "You will confirm with Google." for an
 * account without one; the API needs a sign-in younger than five minutes), and the
 * acknowledgement: "Delete my account" stays grey until it is ticked, then asks in a sheet. The
 * working steps show while it runs; the blocked state lists what must be resolved first. The gate
 * then shows the deletion-pending screen with "Cancel deletion".
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
  const [working, setWorking] = useState<WorkingStep>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const withPassword = session.hasPasswordProvider;
  const google = useGoogleSignIn('reauthenticate');

  const passwordError = submitted && withPassword && !password ? COPY.passwordMissing : null;

  const review = () => {
    setSubmitted(true);
    if ((withPassword && !password) || !acknowledged) {
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setConfirming(false);
    setError(null);
    setStep('working');
    try {
      setWorking('confirm');
      if (withPassword) {
        await session.reauthenticate(password);
      } else if (!(await google.start())) {
        // The Google window was closed: back to the form, nothing to explain.
        setStep('form');
        return;
      }
      if (exportFirst) {
        setWorking('export');
        await exportMyData(account.handle);
      }
      setWorking('schedule');
      await request.mutateAsync({ reason: reason.trim() || null, exportFirst });
      // The saved address and e-Transfer email leave this phone with the account (review fix 1,
      // P3): no screen is left to delete them from.
      if (session.user?.uid) {
        await deleteSavedDetails(session.user.uid);
      }
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
      } else if (withPassword && WRONG_PASSWORD_CODES.has(toAuthError(caught).code)) {
        setError(COPY.passwordWrong);
        setPassword('');
      } else {
        setError(withPassword ? authErrorMessage(caught) : googleErrorMessage(caught));
      }
    }
  };

  if (step === 'blocked') {
    return (
      <SettingsPage
        title={COPY.title}
        testID="screen-delete-account"
        footer={<PillButton label={COPY.close} variant="outline" onPress={() => router.back()} />}
      >
        <View style={styles.blocked} testID="delete-blocked">
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink }]}>
            {COPY.blockedTitle}
          </Text>
          <Text style={[styles.body, { color: palette.textMuted }]}>{COPY.blockedText}</Text>
          {(blockers.length > 0 ? blockers : ['SOME_OBLIGATIONS']).map((blocker) => (
            <View key={blocker} style={styles.fact}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={18}
                color={palette.warning}
              />
              <Text style={[styles.body, styles.grow, { color: palette.ink }]}>
                {blocker === 'SOME_OBLIGATIONS' ? COPY.someObligations : blockerLabel(blocker)}
              </Text>
            </View>
          ))}
        </View>
      </SettingsPage>
    );
  }

  if (step === 'working') {
    const order: WorkingStep[] = exportFirst
      ? ['confirm', 'export', 'schedule']
      : ['confirm', 'schedule'];
    const reached = order.indexOf(working);
    return (
      <SettingsPage title={COPY.title} testID="screen-delete-account">
        <View
          style={styles.working}
          accessibilityLiveRegion="polite"
          accessibilityLabel={COPY.steps[working]}
          testID="delete-working"
        >
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink }]}>
            {COPY.working}
          </Text>
          {order.map((name, index) => (
            <View key={name} style={styles.fact}>
              {index < reached ? (
                <MaterialCommunityIcons name="check" size={20} color={palette.accent} />
              ) : index === reached ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : (
                <MaterialCommunityIcons
                  name="circle-outline"
                  size={20}
                  color={palette.textDisabled}
                />
              )}
              <Text
                style={[
                  styles.body,
                  styles.grow,
                  { color: index <= reached ? palette.ink : palette.textMuted },
                ]}
              >
                {COPY.steps[name]}
              </Text>
            </View>
          ))}
        </View>
        <SimulatedGoogleAccountDialog {...google.dialog} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title={COPY.title}
      testID="screen-delete-account"
      footer={
        <>
          <PillButton
            label={COPY.submit}
            variant="danger"
            disabled={!acknowledged}
            onPress={review}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="delete-submit"
          />
          <PillButton
            label={COPY.keep}
            variant="quiet"
            onPress={() => router.back()}
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            testID="delete-keep"
          />
        </>
      }
    >
      <View style={styles.facts}>
        {COPY.facts.map((fact) => (
          <View key={fact.icon} style={styles.fact}>
            <MaterialCommunityIcons name={fact.icon} size={20} color={palette.textMuted} />
            <Text style={[styles.body, styles.grow, { color: palette.settings.rowIcon }]}>
              {fact.text}
            </Text>
          </View>
        ))}
      </View>
      {error ? <FormMessage testID="delete-error">{error}</FormMessage> : null}
      <TextField
        label={COPY.reason}
        labelAside={COPY.reasonCount(reason.length, REASON_MAX)}
        value={reason}
        onChangeText={setReason}
        placeholder={COPY.reasonPlaceholder}
        multiline
        maxLength={REASON_MAX}
        inputStyle={styles.reason}
        testID="delete-reason"
      />
      <Checkbox
        label={COPY.exportFirst}
        checked={exportFirst}
        onChange={setExportFirst}
        testID="delete-export-first"
      />
      {withPassword ? (
        <PasswordField
          label={COPY.password}
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          hint={COPY.passwordHint}
          autoComplete="current-password"
          textContentType="password"
          testID="delete-password"
        />
      ) : (
        <Text testID="delete-google-note" style={[styles.body, { color: palette.textMuted }]}>
          {COPY.google}
        </Text>
      )}
      <View style={[styles.understand, { borderColor: palette.borderStrong }]}>
        <Checkbox
          label={COPY.understand}
          checked={acknowledged}
          onChange={setAcknowledged}
          testID="delete-acknowledge"
        />
      </View>
      <ConfirmSheet
        visible={confirming}
        title={COPY.sheetTitle}
        message={COPY.sheetBody}
        confirmLabel={COPY.submit}
        cancelLabel={COPY.keep}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
        testID="delete-confirm"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  facts: { gap: spacing[3] },
  fact: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  grow: { flex: 1 },
  body: { fontSize: 14, lineHeight: 20 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: fontWeight.bold },
  reason: { minHeight: 88, textAlignVertical: 'top' },
  understand: { borderWidth: 1, borderRadius: 14, paddingHorizontal: spacing[3] },
  working: { gap: spacing[4], paddingTop: spacing[4] },
  blocked: { gap: spacing[3] },
});
