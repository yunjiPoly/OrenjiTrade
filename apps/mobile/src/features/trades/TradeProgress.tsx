import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TradeEvent, TradeResponse } from '@/src/api/types';
import { toneColor } from '@/src/features/offers/StatusChip';
import { formatDateTime } from '@/src/lib/dates';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import {
  TRADE_EVENT_ICONS,
  tradeEventLabel,
  tradeSteps,
  type NextActionView,
  type TradeStepView,
} from './tradeLabels';

/** The next-action banner (web: `app-trade-next-action`) with the screen's buttons below. */
export function NextActionCard({ view, children }: { view: NextActionView; children?: ReactNode }) {
  const { palette } = useTheme();
  const color = toneColor(view.tone, palette);
  return (
    <View
      testID="trade-next-action"
      accessibilityRole="summary"
      style={[styles.next, { borderColor: color, backgroundColor: palette.surface }]}
    >
      <View style={styles.row}>
        <MaterialCommunityIcons name={view.icon} size={22} color={color} />
        <Text
          testID="trade-next-title"
          accessibilityRole="header"
          style={[textStyle('md'), styles.strong, styles.grow, { color: palette.ink }]}
        >
          {view.title}
        </Text>
      </View>
      <Text testID="trade-next-description" style={[textStyle('sm'), { color: palette.textMuted }]}>
        {view.description}
      </Text>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const STEP_ICONS: Record<TradeStepView['state'], 'check' | 'minus' | 'circle-medium'> = {
  done: 'check',
  skipped: 'minus',
  current: 'circle-medium',
  todo: 'circle-medium',
};

const STATE_WORDS: Record<TradeStepView['state'], string> = {
  done: 'done',
  current: 'your next step',
  skipped: 'skipped',
  todo: 'to do',
};

/** The progress of a trade (web: `app-trade-steps`): steps with both parties' marks. */
export function TradeSteps({ trade }: { trade: TradeResponse }) {
  const { palette } = useTheme();
  const steps = tradeSteps({
    status: trade.status,
    viewerRole: trade.viewerRole,
    counterpartyName: trade.counterparty.displayName,
    meetup: trade.meetup,
    buyerMarkedMeetup: trade.buyerMarkedMeetup,
    sellerMarkedMeetup: trade.sellerMarkedMeetup,
    buyerConfirmedAt: trade.buyerConfirmedAt,
    sellerConfirmedAt: trade.sellerConfirmedAt,
    protectionEnabled: trade.protectionEnabled,
    paymentStatus: trade.payment?.status ?? null,
    paymentSecuredAt: trade.payment?.securedAt ?? null,
    payoutReleasedAt: trade.payment?.payoutReleasedAt ?? null,
    shippedAt: trade.shipment?.shippedAt ?? null,
    disputeOpenedAt: trade.dispute?.openedAt ?? null,
    disputeResolvedAt: trade.dispute?.resolvedAt ?? null,
    disputed: !!trade.dispute,
  });
  return (
    <View accessibilityLabel="Trade progress" style={styles.list}>
      {steps.map((step) => {
        const done = step.state === 'done';
        const current = step.state === 'current';
        return (
          <View
            key={step.key}
            style={styles.step}
            testID={`step-${step.key}`}
            accessible
            accessibilityLabel={`${step.title} (${STATE_WORDS[step.state]}). ${step.hint}${step.marks
              .map((mark) => ` ${mark.who}: ${mark.done ? 'done' : 'not yet'}.`)
              .join('')}`}
          >
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: done
                    ? palette.success
                    : current
                      ? palette.primaryContainer
                      : palette.surfaceVariant,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={STEP_ICONS[step.state]}
                size={16}
                color={done ? palette.onPrimary : current ? palette.primary : palette.textMuted}
              />
            </View>
            <View style={styles.grow}>
              <Text
                style={[
                  textStyle('sm'),
                  styles.strong,
                  { color: step.state === 'skipped' ? palette.textMuted : palette.ink },
                ]}
              >
                {step.title}
              </Text>
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>{step.hint}</Text>
              {step.at ? (
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  {formatDateTime(step.at)}
                </Text>
              ) : null}
              {step.marks.map((mark) => (
                <View
                  key={mark.who}
                  style={styles.row}
                  testID={`step-${step.key}-${mark.who === 'You' ? 'you' : 'other'}`}
                >
                  <MaterialCommunityIcons
                    name={mark.done ? 'check-circle' : 'checkbox-blank-circle-outline'}
                    size={14}
                    color={mark.done ? palette.success : palette.textMuted}
                  />
                  <Text style={[textStyle('xs'), { color: palette.ink }]}>
                    {mark.who}: {mark.done ? 'done' : 'not yet'}
                    {mark.at ? ` · ${formatDateTime(mark.at)}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The timeline of a trade (web: `app-trade-timeline`), oldest first. */
export function TradeTimeline({
  timeline,
  viewerRole,
  sellerName,
  buyerName,
}: {
  timeline: readonly TradeEvent[];
  viewerRole: TradeResponse['viewerRole'];
  sellerName: string;
  buyerName: string;
}) {
  const { palette } = useTheme();
  const names = { SELLER: sellerName, BUYER: buyerName };
  return (
    <View testID="trade-timeline" accessibilityLabel="Trade timeline" style={styles.list}>
      {timeline.map((event) => {
        const details = (event.details ?? null) as Record<string, unknown> | null;
        const reason = event.event === 'CANCELLED' ? details?.['reason'] : null;
        const tracking = event.event === 'SHIPPED' ? details?.['trackingNumber'] : null;
        return (
          <View key={event.id} style={styles.step}>
            <MaterialCommunityIcons
              name={TRADE_EVENT_ICONS[event.event] ?? 'information-outline'}
              size={18}
              color={palette.textMuted}
            />
            <View style={styles.grow}>
              <Text style={[textStyle('sm'), { color: palette.ink }]}>
                {tradeEventLabel(event.event, event.actorRole ?? null, viewerRole, names, details)}
              </Text>
              {typeof reason === 'string' && reason ? (
                <Text style={[textStyle('sm'), styles.quote, { color: palette.textMuted }]}>
                  Reason: “{reason}”
                </Text>
              ) : null}
              {typeof tracking === 'string' && tracking ? (
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  Tracking {tracking}
                </Text>
              ) : null}
              <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                {relativeTime(event.createdAt)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  next: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  strong: { fontWeight: fontWeight.semibold },
  grow: { flex: 1, gap: 2 },
  actions: { gap: spacing[2], marginTop: spacing[1] },
  list: { gap: spacing[3] },
  step: { flexDirection: 'row', gap: spacing[3] },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quote: { fontStyle: 'italic' },
});
