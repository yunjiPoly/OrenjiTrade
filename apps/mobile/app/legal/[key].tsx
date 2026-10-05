import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useLegalDocuments } from '@/src/api/hooks/legal';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { LegalDraftBanner } from '@/src/features/legal/LegalDraftBanner';
import { LEGAL_DOCUMENTS, isLegalKey, legalKeyOf } from '@/src/features/legal/legalDocs';
import { LEGAL_EFFECTIVE_DATE_PLACEHOLDER } from '@/src/legal/legalContent';
import { fontFamily, fontWeight, spacing, textStyle, useTheme } from '@/src/theme';

/** One legal document, rendered in-app from the synced texts (web: `/legal/:key`). */
export default function LegalDocumentScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const legal = useLegalDocuments();
  const document = isLegalKey(key) ? LEGAL_DOCUMENTS[key] : null;

  if (!document) {
    return (
      <Screen testID="screen-legal-document">
        <ErrorState
          title="Unknown legal document"
          message="This document does not exist. Use the legal index to find what you need."
          retryLabel="Open legal index"
          onRetry={() => router.replace('/legal')}
        />
      </Screen>
    );
  }

  const published = legal.data?.find((entry) => legalKeyOf(entry.url) === document.key);

  return (
    <Screen scroll safeBottom testID="screen-legal-document">
      <Stack.Screen options={{ title: document.shortTitle }} />
      <LegalDraftBanner />
      <View style={styles.spacer} />
      <ScreenHeader title={document.title} subtitle={document.summary} />
      <View style={styles.meta}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Effective date: {document.effectiveDate ?? LEGAL_EFFECTIVE_DATE_PLACEHOLDER}
        </Text>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
          Version <Text style={{ fontFamily: fontFamily.mono }}>{document.version}</Text> · Last
          updated {document.lastUpdated}
        </Text>
        {published ? (
          <Text
            testID="legal-published-version"
            style={[textStyle('sm'), { color: palette.textMuted }]}
          >
            Version to accept:{' '}
            <Text style={{ fontFamily: fontFamily.mono }}>{published.version}</Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.sections}>
        {document.definitions.length > 0 ? (
          <SectionCard title="Definitions">
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
        <SectionCard title="Contact">
          <Text style={[textStyle('sm'), { color: palette.ink }]}>{document.contact}</Text>
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { height: spacing[4] },
  meta: { gap: spacing[1], marginBottom: spacing[4] },
  sections: { gap: spacing[3] },
  term: { fontWeight: fontWeight.semibold },
});
