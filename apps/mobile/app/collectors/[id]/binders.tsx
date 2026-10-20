import { Stack, useLocalSearchParams } from 'expo-router';

import {
  CollectorSectionScreen,
  sectionTitle,
} from '@/src/features/collectors/CollectorSectionScreen';

/** "See all" of another collector's profile (stage R6): `/collectors/<handle>/binders`. */
export default function CollectorSection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: sectionTitle('binders', id ?? '') }} />
      <CollectorSectionScreen section="binders" handle={id ?? ''} />
    </>
  );
}
