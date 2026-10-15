import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SaleNotice } from '@/src/api/types';
import { Text } from '@/src/components/ui/Text';
import { fontFamily, fontWeight, useTheme } from '@/src/theme';

import { SALE_MESSAGE_COPY } from './chatCopy';
import { saleSentence } from './dealRules';

/**
 * The sale message both collectors see once the seller marked the chat's card or deck core sold
 * (owner spec 2026-10-14, section 10, "Afterwards"): "You marked {card} as sold to {buyer}." for
 * the seller, "{seller} marked {card} as sold to you." for the buyer, "Tracking {number}" when the
 * seller gave one (in mono), and "Rate {other}", which opens the rating of the sale. The tracking
 * number is the two collectors' only.
 */
export function SaleMessage({
  sale,
  selfId,
  otherHandle,
  onRate,
  testID,
}: {
  sale: SaleNotice;
  selfId: string | null;
  otherHandle: string;
  onRate: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const sentence = saleSentence(sale, selfId, otherHandle);
  return (
    <View
      testID={testID}
      style={[
        styles.box,
        { backgroundColor: palette.chat.saleSurface, borderColor: palette.chat.saleBorder },
      ]}
    >
      <Text
        testID="sale-message-text"
        accessibilityRole="text"
        style={[styles.text, { color: palette.chat.saleText }]}
      >
        {sentence}
      </Text>
      {sale.trackingNumber ? (
        <View
          testID="sale-message-tracking"
          accessible
          accessibilityLabel={SALE_MESSAGE_COPY.trackingSpoken(sale.trackingNumber)}
          style={[
            styles.tracking,
            {
              backgroundColor: palette.chat.saleTrackingSurface,
              borderColor: palette.chat.saleBorder,
            },
          ]}
        >
          <Text style={[styles.trackingLabel, { color: palette.chat.saleLabel }]}>
            {SALE_MESSAGE_COPY.tracking}
          </Text>
          <Text selectable style={[styles.trackingNumber, { color: palette.ink }]}>
            {sale.trackingNumber}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={SALE_MESSAGE_COPY.rate(otherHandle)}
        onPress={onRate}
        testID="sale-message-rate"
        style={({ pressed }) => [
          styles.rate,
          { borderColor: palette.accent },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons name="star" size={15} color={palette.chat.saleAction} />
        <Text style={[styles.rateLabel, { color: palette.chat.saleAction }]}>
          {SALE_MESSAGE_COPY.rate(otherHandle)}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'center',
    maxWidth: 320,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 10,
  },
  text: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  tracking: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  trackingLabel: { fontSize: 12, lineHeight: 16 },
  trackingNumber: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  rate: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rateLabel: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.8 },
});
