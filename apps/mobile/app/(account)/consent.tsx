import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { messageOf } from '@/src/api/errorMessages';
import { useLegalDocuments } from '@/src/api/hooks/legal';
import { useSession } from '@/src/auth/session';
import { Button } from '@/src/components/ui/Button';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { LegalConsentList } from '@/src/features/legal/LegalConsentList';
import { describeConsent } from '@/src/features/legal/legalDocs';
import { fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Shown while the API answers 428 `TERMS_ACCEPTANCE_REQUIRED` (new documents, new versions, or an
 * account created elsewhere): records each acceptance, then the gate continues (web:
 * `/auth/consent`).
 */
export default function ConsentScreen() {
  const { palette } = useTheme();
  const session = useSession();
  const account = useAccount();
  const legal = useLegalDocuments();
  const [accepted, setAccepted] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () => account.requiredConsents.map((consent) => describeConsent(consent, legal.data)),
    [account.requiredConsents, legal.data]
  );
  const allAccepted = items.every((item) => accepted.includes(item.documentType));

  const accept = async () => {
    setSubmitted(true);
    if (!allAccepted) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await account.acceptConsents(account.requiredConsents);
    } catch (caught) {
      setError(messageOf(caught, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll safeBottom testID="screen-consent">
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[textStyle('2xl', 'heading'), styles.title, { color: palette.ink }]}
        >
          Review our terms
        </Text>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          Please accept the current versions of these documents to keep using OrenjiTrade.
        </Text>
      </View>
      <View style={styles.body}>
        {error ? <FormMessage>{error}</FormMessage> : null}
        {account.refreshing && items.length === 0 ? (
          <SkeletonList rows={3} rowHeight={40} />
        ) : items.length === 0 ? (
          <FormMessage tone="success">You have accepted every current document.</FormMessage>
        ) : (
          <>
            <LegalConsentList
              items={items}
              accepted={accepted}
              onChange={setAccepted}
              showError={submitted && !allAccepted}
            />
            <Button
              label="Accept and continue"
              loading={saving}
              onPress={() => void accept()}
              testID="consent-accept"
            />
          </>
        )}
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => void session.signOut()}
          testID="consent-sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing[2], marginBottom: spacing[6] },
  title: { fontWeight: fontWeight.bold },
  body: { gap: spacing[4] },
});
