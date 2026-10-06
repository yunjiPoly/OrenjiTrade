import { useRouter } from 'expo-router';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { Button, type ButtonVariant } from '@/src/components/ui/Button';
import { spacing } from '@/src/theme';

import { canOfferOn, type OfferTarget } from './offerTarget';
import { useOfferTargets } from './offerTargetStore';

/**
 * "Make an offer" on a public card (web: `app-make-offer-button`): shown only when the card
 * accepts at least one kind of offer and is not the viewer's own. Opens the offer form with the
 * card the entry point already shows (`/offers/new?item=`); `beforeOpen` closes a bottom sheet
 * first. `inCard` adds the margins of an `ItemRow` footer.
 */
export function MakeOfferButton({
  target,
  variant = 'secondary',
  beforeOpen,
  inCard = false,
  style,
  testID,
}: {
  target: OfferTarget;
  variant?: ButtonVariant;
  beforeOpen?: () => void;
  inCard?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const router = useRouter();
  const selfId = useAccount().me?.id ?? null;
  const put = useOfferTargets((state) => state.put);
  if (!canOfferOn(target, selfId)) {
    return null;
  }
  return (
    <Button
      label="Make an offer"
      icon="tag-outline"
      variant={variant}
      accessibilityLabel={`Make an offer on ${target.cardName}`}
      style={[inCard && styles.inCard, style]}
      testID={testID ?? `make-offer-${target.itemId}`}
      onPress={() => {
        put(target);
        beforeOpen?.();
        router.push({ pathname: '/offers/new', params: { item: target.itemId } });
      }}
    />
  );
}

const styles = StyleSheet.create({
  inCard: { marginHorizontal: spacing[2], marginBottom: spacing[2] },
});
