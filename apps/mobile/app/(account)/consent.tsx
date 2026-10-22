import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { needsAgeConfirmation } from '@/src/account/accountStatus';
import { messageOf } from '@/src/api/errorMessages';
import { useLegalDocuments } from '@/src/api/hooks/legal';
import type { ConsentRequest } from '@/src/api/types';
import { useSession } from '@/src/auth/session';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { CONSENT_COPY } from '@/src/features/account/accountCopy';
import { ageConfirmationOf, ageConsentFor } from '@/src/features/legal/ageConfirmation';
import { AgeConfirmationCheckbox } from '@/src/features/legal/AgeConfirmationCheckbox';
import { LegalConsentList } from '@/src/features/legal/LegalConsentList';
import { describeConsent } from '@/src/features/legal/legalDocs';
import { useLegalLanguage } from '@/src/features/legal/legalLanguage';
import { spacing, textStyle, useTheme } from '@/src/theme';

/** "Accept all" joins the card once more than this many documents are due. */
export const CONSENT_ACCEPT_ALL_FROM = 3;

/**
 * 43 Review our terms (stage R12, mockup v50). Shown while the API answers 428
 * `TERMS_ACCEPTANCE_REQUIRED` (new documents, new versions, an account created elsewhere such as a
 * Google sign-up) and while the account never confirmed being 18 or older
 * (`onboarding.ageConfirmed === false`): the due documents with their versions, each with its box
 * and "Read", the age line when needed (alone when no document is due), "Accept and continue"
 * disabled until every box is ticked, and Sign out. Records each acceptance and the 18+
 * confirmation, then the gate continues (web: `/auth/consent`).
 */
export default function ConsentScreen() {
  const { palette } = useTheme();
  const session = useSession();
  const account = useAccount();
  const snackbar = useSnackbar();
  const legal = useLegalDocuments();
  const { language } = useLegalLanguage();
  const [accepted, setAccepted] = useState<string[]>([]);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () => account.requiredConsents.map((consent) => describeConsent(consent, legal.data, language)),
    [account.requiredConsents, language, legal.data]
  );
  // Only an API that reports the flag as false asks for it; its version comes from the documents.
  const ageNeeded = needsAgeConfirmation(account.me ?? undefined);
  const ageConfirmation = ageConfirmationOf(legal.data);
  const allAccepted = items.every((item) => accepted.includes(item.documentType));
  const ready = allAccepted && (!ageNeeded || (ageConfirmed && ageConfirmation !== null));
  const ageOnly = items.length === 0 && ageNeeded;

  const accept = async () => {
    if (!ready) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const consents: ConsentRequest[] = [...account.requiredConsents];
      if (ageNeeded && ageConfirmation) {
        consents.push(ageConsentFor(ageConfirmation));
      }
      await account.acceptConsents(consents);
      if (ageOnly) {
        snackbar.show(CONSENT_COPY.welcomeBack, { duration: 8000 });
      }
    } catch (caught) {
      setError(messageOf(caught, CONSENT_COPY.retry));
    } finally {
      setSaving(false);
    }
  };

  const waiting = (account.refreshing && items.length === 0 && !ageNeeded) || legal.isPending;
  const ageMissing = ageNeeded && ageConfirmation === null;

  let body;
  if (waiting) {
    body = (
      <View accessibilityLabel={CONSENT_COPY.loadingDocuments} testID="consent-loading">
        <SkeletonList rows={3} rowHeight={48} />
      </View>
    );
  } else if (ageMissing) {
    body = (
      <ErrorState
        compact
        testID="consent-age-error"
        error={legal.error}
        title={CONSENT_COPY.ageError}
        onRetry={() => void legal.refetch()}
      />
    );
  } else if (items.length === 0 && !ageNeeded) {
    body = <FormMessage tone="success">{CONSENT_COPY.allAccepted}</FormMessage>;
  } else {
    body = (
      <>
        {items.length > 0 ? (
          <LegalConsentList
            items={items}
            accepted={accepted}
            onChange={setAccepted}
            acceptAll={items.length >= CONSENT_ACCEPT_ALL_FROM}
            rows="version"
          />
        ) : null}
        {ageNeeded ? (
          <AgeConfirmationCheckbox
            checked={ageConfirmed}
            onChange={setAgeConfirmed}
            disabled={saving}
          />
        ) : null}
      </>
    );
  }
  const asking = !waiting && !ageMissing && (items.length > 0 || ageNeeded);

  return (
    <Screen scroll safeBottom testID="screen-consent" contentContainerStyle={styles.page}>
      <View style={styles.body}>
        <Text style={[textStyle('md'), { color: palette.textMuted }]}>
          {ageOnly ? CONSENT_COPY.ageOnlyIntro : CONSENT_COPY.intro}
        </Text>
        {error ? <FormMessage testID="consent-error">{error}</FormMessage> : null}
        {body}
      </View>
      <View style={styles.actions}>
        {asking ? (
          <PillButton
            label={CONSENT_COPY.accept}
            loading={saving}
            loadingLabel={CONSENT_COPY.accepting}
            disabled={!ready}
            onPress={() => void accept()}
            testID="consent-accept"
          />
        ) : null}
        <PillButton
          label={CONSENT_COPY.signOut}
          variant="quiet"
          disabled={saving}
          onPress={() => void session.signOut()}
          testID="consent-sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: spacing[5], paddingTop: spacing[1] },
  body: { gap: 14 },
  actions: { marginTop: 'auto', paddingTop: spacing[6], gap: spacing[2] },
});
