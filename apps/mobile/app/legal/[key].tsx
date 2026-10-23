import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useLegalDocuments } from '@/src/api/hooks/legal';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Text } from '@/src/components/ui/Text';
import { LegalDraftBanner } from '@/src/features/legal/LegalDraftBanner';
import { isLegalKey, legalKeyOf } from '@/src/features/legal/legalDocs';
import { LegalLanguageSwitch } from '@/src/features/legal/LegalLanguageSwitch';
import { useLegalTexts } from '@/src/features/legal/legalTexts';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { fontFamily, fontWeight, spacing, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

/**
 * One legal document (stage R13, mockup v50 screen 59; web: `/legal/:key`), rendered in-app from
 * the synced texts in the active legal language: the English | Français switch, the draft banner
 * (and the translation marking in French), the title, the version, the last update and the
 * effective date, the version to accept as the API publishes it, the definitions, the numbered
 * sections and the contact.
 */
export default function LegalDocumentScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const legal = useLegalDocuments();
  const texts = useLegalTexts();
  const labels = texts.labels;
  const document = isLegalKey(key) ? texts.documents[key] : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/legal'));

  if (!document) {
    return (
      <SettingsPage title={labels.indexTitle} testID="screen-legal-document" onBack={back}>
        <ErrorState
          title={labels.unknownTitle}
          message={labels.unknownMessage}
          retryLabel={labels.openIndex}
          onRetry={() => router.replace('/legal')}
        />
      </SettingsPage>
    );
  }

  const published = legal.data?.find((entry) => legalKeyOf(entry.url) === document.key);
  const muted = [styles.meta, { color: palette.textMuted }];
  const clause = [styles.clause, { color: palette.settings.rowIcon }];
  const number = [styles.number, { color: palette.settings.chevron }];

  return (
    <SettingsPage title={document.shortTitle} testID="screen-legal-document" onBack={back}>
      <LegalLanguageSwitch />
      <LegalDraftBanner />
      <View style={styles.head}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink }]}
          testID="legal-document-title"
        >
          {document.title}
        </Text>
        <Text style={muted}>{document.summary}</Text>
        <Text style={muted}>
          {labels.version} <Text style={styles.mono}>{document.version}</Text> ·{' '}
          {labels.lastUpdated} {document.lastUpdated}
        </Text>
        <Text style={muted}>
          {labels.effectiveDate} {document.effectiveDate ?? texts.effectiveDatePlaceholder}
        </Text>
        {published ? (
          <Text testID="legal-published-version" style={muted}>
            {labels.versionToAccept} <Text style={styles.mono}>{published.version}</Text>
          </Text>
        ) : null}
      </View>

      {document.definitions.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink }]}>
            {labels.definitions}
          </Text>
          {document.definitions.map((definition) => (
            <Text key={definition.term} style={clause}>
              <Text style={[styles.term, { color: palette.ink }]}>{definition.term}: </Text>
              {definition.definition}
            </Text>
          ))}
        </View>
      ) : null}
      {document.sections.map((section, sectionIndex) => (
        <View key={section.id} style={styles.section}>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink }]}>
            {`${sectionIndex + 1}. ${section.heading}`}
          </Text>
          {section.clauses.map((text, clauseIndex) => (
            <Text key={text} style={clause}>
              <Text style={number}>
                {sectionIndex + 1}.{clauseIndex + 1}{' '}
              </Text>
              {text}
            </Text>
          ))}
        </View>
      ))}
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: palette.ink }]}>
          {labels.contact}
        </Text>
        <Text style={clause}>{document.contact}</Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  meta: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fontFamily.mono },
  section: { gap: spacing[2] },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: fontWeight.bold },
  clause: { fontSize: 15, lineHeight: 23 },
  number: { fontSize: 12, lineHeight: 18 },
  term: { fontWeight: fontWeight.semibold },
});
