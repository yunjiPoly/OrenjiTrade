import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useLegalDocuments } from '@/src/api/hooks/legal';
import { Divider, ListRow, ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { LegalDraftBanner } from '@/src/features/legal/LegalDraftBanner';
import { LEGAL_DOCUMENT_LIST, legalKeyOf } from '@/src/features/legal/legalDocs';
import { spacing } from '@/src/theme';

/** Legal index (web: `/legal`): every document, with the current version the API publishes. */
export default function LegalIndexScreen() {
  const router = useRouter();
  const legal = useLegalDocuments();

  const versionOf = (key: string) =>
    legal.data?.find((document) => legalKeyOf(document.url) === key)?.version ?? null;

  return (
    <Screen scroll safeBottom testID="screen-legal">
      <ScreenHeader
        title="Legal"
        subtitle="The rules of OrenjiTrade and how we handle your data."
      />
      <View style={styles.root}>
        <LegalDraftBanner />
        <SectionCard>
          {LEGAL_DOCUMENT_LIST.map((document, index) => {
            const version = versionOf(document.key);
            return (
              <View key={document.key}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  icon="file-document-outline"
                  label={document.title}
                  detail={
                    version ? `${document.summary} Current version ${version}.` : document.summary
                  }
                  onPress={() =>
                    router.push({ pathname: '/legal/[key]', params: { key: document.key } })
                  }
                  testID={`legal-link-${document.key}`}
                />
              </View>
            );
          })}
        </SectionCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
});
