import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ConversationSubject } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { safeCardImageUrl } from '@/src/lib/cardImages';
import { useTheme } from '@/src/theme';

/**
 * The picture of what a chat is about (mockup screens 22 to 25): a card's picture in its 5:7
 * frame, or a deck core's first photo in a rounded square (its first card picture, or a cards icon,
 * without a photo). Decorative: the row or bar around it names the subject.
 */
export function SubjectThumb({
  subject,
  size = 'row',
  testID,
}: {
  subject: Pick<ConversationSubject, 'kind' | 'imageUrl' | 'name'>;
  /** `row`: an inbox row (44 pt square for a deck core); `bar`: the pinned bar and the sheet. */
  size?: 'row' | 'bar';
  testID?: string;
}) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  if (subject.kind === 'CARD') {
    return <CardImage src={subject.imageUrl} alt="" size="xs" testID={testID ?? 'subject-thumb'} />;
  }
  const url = safeCardImageUrl(subject.imageUrl);
  const side = size === 'row' ? 44 : 40;
  return (
    <View
      testID={testID ?? 'subject-thumb'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.core,
        {
          width: side,
          height: side,
          borderColor: palette.borderStrong,
          backgroundColor: palette.deckCore.surface,
        },
      ]}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessible={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <MaterialCommunityIcons name="cards-outline" size={20} color={palette.deckCore.tagText} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  core: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
