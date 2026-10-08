import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { OfferEvent } from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { OFFER_EVENT_ICONS, offerEventLabel, offerTermsText, type OfferRole } from './offerLabels';

export interface HistoryEntry {
  id: string;
  icon: IconName;
  label: string;
  terms: string | null;
  note: string | null;
  reason: string | null;
  at: string;
  mine: boolean;
}

/**
 * The negotiation in words, oldest first (web: `OfferHistoryComponent.entries`): each proposal
 * with its terms and the cards' names, the answers with their reasons; of the "viewed" events
 * only the other party's latest one is kept.
 */
export function historyEntries(
  history: readonly OfferEvent[],
  viewerRole: OfferRole,
  names: Record<OfferRole, string>
): HistoryEntry[] {
  let lastViewed = -1;
  history.forEach((event, index) => {
    if (event.event === 'VIEWED' && event.actorRole !== viewerRole) {
      lastViewed = index;
    }
  });
  return history
    .filter((event, index) => event.event !== 'VIEWED' || index === lastViewed)
    .map((event) => {
      const proposal = event.event === 'CREATED' || event.event === 'COUNTERED';
      const actor = event.actorRole ?? null;
      const cards = event.terms.tradeItems.map((line) =>
        line.quantity > 1 ? `${line.cardName} ×${line.quantity}` : line.cardName
      );
      return {
        id: event.id,
        icon: OFFER_EVENT_ICONS[event.event] ?? 'information-outline',
        label: offerEventLabel(event.event, actor, viewerRole, names),
        terms: proposal
          ? offerTermsText({
              kind: event.terms.kind,
              cashAmount: event.terms.cashAmount,
              currency: event.terms.currency,
              cards: event.terms.tradeItems,
            }) + (cards.length > 0 ? ` (${cards.join(', ')})` : '')
          : null,
        note: proposal ? (event.terms.message ?? null) : null,
        reason: event.reason ?? null,
        at: event.createdAt,
        mine: actor === viewerRole,
      };
    });
}

/** The history of a negotiation as a timeline. */
export function OfferHistory({
  history,
  viewerRole,
  sellerName,
  buyerName,
}: {
  history: readonly OfferEvent[];
  viewerRole: OfferRole;
  sellerName: string;
  buyerName: string;
}) {
  const { palette } = useTheme();
  const entries = historyEntries(history, viewerRole, { SELLER: sellerName, BUYER: buyerName });
  return (
    <View testID="offer-history" accessibilityLabel="Offer history" style={styles.list}>
      {entries.map((entry, index) => (
        <View key={entry.id} style={styles.step} testID={`offer-history-${index}`}>
          <View
            style={[
              styles.dot,
              { backgroundColor: entry.mine ? palette.primaryContainer : palette.surfaceVariant },
            ]}
          >
            <MaterialCommunityIcons
              name={entry.icon}
              size={16}
              color={entry.mine ? palette.onPrimaryContainer : palette.textMuted}
            />
          </View>
          <View style={styles.body}>
            <Text style={[textStyle('sm'), styles.label, { color: palette.ink }]}>
              {entry.label}
            </Text>
            {entry.terms ? (
              <Text style={[textStyle('sm'), { color: palette.ink }]}>{entry.terms}</Text>
            ) : null}
            {entry.note ? (
              <Text style={[textStyle('sm'), styles.quote, { color: palette.textMuted }]}>
                “{entry.note}”
              </Text>
            ) : null}
            {entry.reason ? (
              <Text style={[textStyle('sm'), styles.quote, { color: palette.textMuted }]}>
                Reason: “{entry.reason}”
              </Text>
            ) : null}
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {relativeTime(entry.at)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[3] },
  step: { flexDirection: 'row', gap: spacing[3] },
  dot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  label: { fontWeight: fontWeight.semibold },
  quote: { fontStyle: 'italic' },
});
