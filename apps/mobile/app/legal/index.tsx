import { useRouter } from 'expo-router';

import { useLegalDocuments } from '@/src/api/hooks/legal';
import { LegalDraftBanner } from '@/src/features/legal/LegalDraftBanner';
import {
  PHONE_LEGAL_KEYS,
  PHONE_LEGAL_SUMMARIES,
  legalKeyOf,
} from '@/src/features/legal/legalDocs';
import { LegalLanguageSwitch } from '@/src/features/legal/LegalLanguageSwitch';
import { useLegalTexts } from '@/src/features/legal/legalTexts';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';

/**
 * Legal (stage R13, mockup v50 screen 58; web: `/legal`): the English | Français switch, the draft
 * banner and the documents in the active legal language, each with its one line and the version
 * the API publishes. The phone lists seven documents: the Payment Protection and the Refund and
 * Dispute policies are the web's (ADR 0018, the phone has no payments).
 */
export default function LegalIndexScreen() {
  const router = useRouter();
  const legal = useLegalDocuments();
  const texts = useLegalTexts();

  const versionOf = (key: string) =>
    legal.data?.find((document) => legalKeyOf(document.url) === key)?.version ?? null;

  return (
    <SettingsPage
      title={texts.labels.indexTitle}
      testID="screen-legal"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    >
      <LegalLanguageSwitch />
      <LegalDraftBanner />
      <SettingsGroup testID="legal-documents">
        {PHONE_LEGAL_KEYS.map((key) => {
          const document = texts.documents[key];
          const summary =
            texts.language === 'en'
              ? (PHONE_LEGAL_SUMMARIES[key] ?? document.summary)
              : document.summary;
          const version = versionOf(key);
          return (
            <SettingsRow
              key={key}
              label={document.title}
              detail={version ? `${summary} ${texts.labels.currentVersion(version)}` : summary}
              onPress={() => router.push({ pathname: '/legal/[key]', params: { key } })}
              testID={`legal-link-${key}`}
            />
          );
        })}
      </SettingsGroup>
    </SettingsPage>
  );
}
