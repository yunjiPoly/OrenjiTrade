import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import type { OfferActionName } from './offerLabels';

/**
 * "Your answer" (web: `app-offer-action-bar`): whose turn it is, and only the answers the API
 * allows right now (`allowedActions`): Accept, Counter, Decline (the party whose turn it is),
 * Withdraw (the buyer while OPEN), plus Message the other collector.
 */
export function OfferActionBar({
  allowedActions,
  busy,
  yourTurn,
  waiting,
  otherName,
  messaging,
  onAccept,
  onCounter,
  onDecline,
  onWithdraw,
  onMessage,
}: {
  allowedActions: readonly string[];
  busy: OfferActionName | null;
  yourTurn: boolean;
  waiting: boolean;
  otherName: string;
  messaging: boolean;
  onAccept: () => void;
  onCounter: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onMessage: () => void;
}) {
  const { palette } = useTheme();
  const can = (action: OfferActionName) => allowedActions.includes(action);
  const title = yourTurn
    ? 'Your turn to answer'
    : waiting
      ? `Waiting for ${otherName}`
      : 'This negotiation is closed';
  const hint = yourTurn
    ? 'Accept to open a trade, counter with other terms, or decline.'
    : waiting
      ? `You will be notified as soon as ${otherName} answers.`
      : null;
  return (
    <View
      testID="offer-action-bar"
      style={[
        styles.bar,
        {
          borderColor: yourTurn ? palette.primary : palette.border,
          backgroundColor: yourTurn ? palette.primaryContainer : palette.surface,
        },
      ]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons
          name={yourTurn ? 'bell-ring-outline' : waiting ? 'timer-sand' : 'lock-clock'}
          size={20}
          color={yourTurn ? palette.onPrimaryContainer : palette.textMuted}
        />
        <Text
          testID="offer-turn"
          accessibilityRole="header"
          style={[
            textStyle('md'),
            styles.title,
            { color: yourTurn ? palette.onPrimaryContainer : palette.ink },
          ]}
        >
          {title}
        </Text>
      </View>
      {hint ? (
        <Text
          style={[
            textStyle('sm'),
            { color: yourTurn ? palette.onPrimaryContainer : palette.textMuted },
          ]}
        >
          {hint}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {can('ACCEPT') ? (
          <Button
            label="Accept"
            icon="handshake"
            loading={busy === 'ACCEPT'}
            loadingLabel="Accepting…"
            disabled={!!busy}
            onPress={onAccept}
            testID="offer-accept"
          />
        ) : null}
        {can('COUNTER') ? (
          <Button
            label="Counter"
            icon="swap-horizontal"
            variant="secondary"
            disabled={!!busy}
            onPress={onCounter}
            testID="offer-counter"
          />
        ) : null}
        {can('DECLINE') ? (
          <Button
            label="Decline"
            icon="minus-circle-outline"
            variant="ghost"
            loading={busy === 'DECLINE'}
            loadingLabel="Declining…"
            disabled={!!busy}
            onPress={onDecline}
            testID="offer-decline"
          />
        ) : null}
        {can('CANCEL') ? (
          <Button
            label="Withdraw offer"
            icon="undo"
            variant="ghost"
            loading={busy === 'CANCEL'}
            loadingLabel="Withdrawing…"
            disabled={!!busy}
            onPress={onWithdraw}
            testID="offer-withdraw"
          />
        ) : null}
        <Button
          label={`Message ${otherName}`}
          icon="message-text-outline"
          variant="ghost"
          loading={messaging}
          loadingLabel="Opening…"
          onPress={onMessage}
          testID="offer-message-other"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  title: { fontWeight: fontWeight.semibold, flex: 1 },
  actions: { gap: spacing[2] },
});
