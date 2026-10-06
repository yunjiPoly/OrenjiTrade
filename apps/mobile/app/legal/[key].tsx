import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useLegalDocuments } from '@/src/api/hooks/legal';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { LegalDraftBanner } from '@/src/features/legal/LegalDraftBanner';
import { isLegalKey, legalKeyOf } from '@/src/features/legal/legalDocs';
import { LegalLanguageSwitch } from '@/src/features/legal/LegalLanguageSwitch';
import { useLegalTexts } from '@/src/features/legal/legalTexts';
import { fontFamily, fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * One legal document, rendered in-app from the synced texts in the active legal language
 * (web: `/legal/:key`): EN / FR switch, the draft banner (and the translation marking in French),
 * the version to accept as the API publishes it.
 */
export default function LegalDocumentScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const legal = useLegalDocuments();
  const texts = useLegalTexts();
  const labels = texts.labels;
  const document = isLegalKey(key) ? texts.documents[key] : null;

  if (!document) {
    return (
      <Screen testID="screen-legal-document">
        <ErrorState
          title={labels.unknownTitle}
          message={labels.unknownMessage}
          retryLabel={labels.openIndex}
          onRetry={() => router.replace('/legal')}
        />
      </Screen>
    );
  }

  const published = legal.data?.find((entry) => legalKeyOf(entry.url) === document.key);

  return (
    <Screen scroll safeBottom testID="screen-legal-document">
      <Stack.Screen options={{ title: document.shortTitle }} />
      <View style={styles.bar}>
        <LegalLanguageSwitch />
      </View>
      <LegalDraftBanner />
      <View style={styles.spacer} />
      <ScreenHeader title={document.title} subtitle={document.summary} />
      <View style={styles.meta}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {labels.effectiveDate} {document.effectiveDate ?? texts.effectiveDatePlaceholder}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          {labels.version} <Text style={{ fontFamily: fontFamily.mono }}>{document.version}</Text> ·{' '}
          {labels.lastUpdated} {document.lastUpdated}
        </Text>
        {published ? (
          <Text
            testID="legal-published-version"
            style={[textStyle('sm'), { color: palette.textMuted }]}
          >
            {labels.versionToAccept}{' '}
            <Text style={{ fontFamily: fontFamily.mono }}>{published.version}</Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.sections}>
        {document.definitions.length > 0 ? (
          <SectionCard title={labels.definitions}>
            {document.definitions.map((definition) => (
              <Text key={definition.term} style={[textStyle('sm'), { color: palette.ink }]}>
                <Text style={styles.term}>{definition.term}: </Text>
                {definition.definition}
              </Text>
            ))}
          </SectionCard>
        ) : null}
        {document.sections.map((section, sectionIndex) => (
          <SectionCard key={section.id} title={`${sectionIndex + 1}. ${section.heading}`}>
            {section.clauses.map((clause, clauseIndex) => (
              <Text key={clause} style={[textStyle('sm'), { color: palette.ink }]}>
                <Text style={[styles.term, { color: palette.textMuted }]}>
                  {sectionIndex + 1}.{clauseIndex + 1}{' '}
                </Text>
                {clause}
              </Text>
            ))}
          </SectionCard>
        ))}
        <SectionCard title={labels.contact}>
          <Text style={[textStyle('sm'), { color: palette.ink }]}>{document.contact}</Text>
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing[3] },
  spacer: { height: spacing[4] },
  meta: { gap: spacing[1], marginBottom: spacing[4] },
  sections: { gap: spacing[3] },
  term: { fontWeight: fontWeight.semibold },
});
