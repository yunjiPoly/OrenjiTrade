import { useRouter } from 'expo-router';

import { FEATURE, useFeature } from '@/src/api/hooks/featureFlags';
import { Button } from '@/src/components/ui/Button';
import type { ViewStyleProp } from '@/src/theme';

/**
 * "See Premium" of a reached plan limit (web: the limit-reached dialog's action): opens the
 * Premium screen. Shown only while premium plans are sold (`premiumPlans`).
 */
export function SeePremiumButton({
  testID = 'see-premium',
  style,
}: {
  testID?: string;
  style?: ViewStyleProp;
}) {
  const router = useRouter();
  const premium = useFeature(FEATURE.premiumPlans);
  if (!premium.enabled) {
    return null;
  }
  return (
    <Button
      label="See Premium"
      icon="crown-outline"
      variant="secondary"
      onPress={() => router.push('/premium')}
      style={style}
      testID={testID}
    />
  );
}
