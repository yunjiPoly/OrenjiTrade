import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useLegalDocuments } from '@/src/api/hooks/legal';
import { Divider, ListRow, ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { LegalDraftBanner } from '@/src/features/legal/LegalDraftBanner';
import { legalKeyOf } from '@/src/features/legal/legalDocs';
import { LegalLanguageSwitch } from '@/src/features/legal/LegalLanguageSwitch';
import { useLegalTexts } from '@/src/features/legal/legalTexts';
import { spacing } from '@/src/theme';

/**
 * Legal index (web: `/legal`): every document in the active legal language (EN / FR switch,
 * French by default on a French device), with the current version the API publishes.
 */
export default function LegalIndexScreen() {
  const router = useRouter();
  const legal = useLegalDocuments();
  const texts = useLegalTexts();

  const versionOf = (key: string) =>
    legal.data?.find((document) => legalKeyOf(document.url) === key)?.version ?? null;

  return (
    <Screen scroll safeBottom testID="screen-legal">
      <View style={styles.bar}>
        <LegalLanguageSwitch />
      </View>
      <ScreenHeader title={texts.labels.indexTitle} subtitle={texts.labels.indexSubtitle} />
      <View style={styles.root}>
        <LegalDraftBanner />
        <SectionCard>
          {texts.documentList.map((document, index) => {
            const version = versionOf(document.key);
            return (
              <View key={document.key}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  icon="file-document-outline"
                  label={document.title}
                  detail={
                    version
                      ? `${document.summary} ${texts.labels.currentVersion(version)}`
                      : document.summary
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
  bar: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: spacing[3] },
  root: { gap: spacing[4] },
});
