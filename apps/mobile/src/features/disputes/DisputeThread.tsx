import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DisputeEvent, DisputeMessage } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { TextField } from '@/src/components/ui/TextField';
import {
  DISPUTE_EVENT_ICONS,
  DISPUTE_TEXT_MAX,
  disputeEventLabel,
} from '@/src/features/payments/paymentLabels';
import { disputeMessageError } from '@/src/features/payments/protectedForms';
import { formatDateTime } from '@/src/lib/dates';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * The messages of a dispute between the two parties and OrenjiTrade support (web:
 * `app-dispute-thread`), oldest first, with a composer while posting is open, or why it is
 * closed (on hold, decided).
 */
export function DisputeThread({
  messages,
  viewer,
  canPost,
  busy,
  label,
  closedText,
  onSend,
}: {
  messages: readonly DisputeMessage[];
  viewer: string | null | undefined;
  canPost: boolean;
  busy: boolean;
  label: string;
  closedText: string | null;
  /** Resolves whether the message was posted (the composer then clears). */
  onSend: (text: string) => Promise<boolean>;
}) {
  const { palette } = useTheme();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched ? disputeMessageError(text) : null;

  const send = async () => {
    setTouched(true);
    if (disputeMessageError(text) || busy) {
      return;
    }
    if (await onSend(text)) {
      setText('');
      setTouched(false);
    }
  };

  return (
    <View style={styles.root}>
      {messages.length === 0 ? (
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="dispute-thread-empty">
          No messages yet.
        </Text>
      ) : (
        <View style={styles.list} accessibilityLabel="Dispute messages">
          {messages.map((entry) => {
            const mine = entry.authorRole === viewer;
            return (
              <View
                key={entry.id}
                testID="dispute-message"
                style={[
                  styles.message,
                  mine ? styles.mine : styles.theirs,
                  {
                    backgroundColor: mine ? palette.primaryContainer : palette.surfaceVariant,
                  },
                ]}
              >
                <Text style={[textStyle('xs'), styles.strong, { color: palette.textMuted }]}>
                  {mine ? 'You' : entry.authorName} · {formatDateTime(entry.createdAt)}
                </Text>
                <Text style={[textStyle('sm'), { color: palette.ink }]}>{entry.body}</Text>
              </View>
            );
          })}
        </View>
      )}
      {canPost ? (
        <View style={styles.composer}>
          <TextField
            label={label}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={DISPUTE_TEXT_MAX + 50}
            error={error}
            hint={`${text.length} / ${DISPUTE_TEXT_MAX}`}
            editable={!busy}
            testID="dispute-message-input"
          />
          <Button
            label="Send"
            icon="send"
            loading={busy}
            loadingLabel="Sending…"
            onPress={() => void send()}
            testID="dispute-message-send"
          />
        </View>
      ) : closedText ? (
        <View style={styles.closed} testID="dispute-thread-closed">
          <MaterialCommunityIcons name="lock-outline" size={16} color={palette.textMuted} />
          <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>
            {closedText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The timeline of a dispute (web: `app-dispute-timeline`), oldest first. */
export function DisputeTimeline({
  timeline,
  viewer,
  names,
  currency,
}: {
  timeline: readonly DisputeEvent[];
  viewer: string | null | undefined;
  names: { BUYER: string; SELLER: string };
  currency: string | null | undefined;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.list} testID="dispute-timeline" accessibilityLabel="Dispute timeline">
      {timeline.map((event) => (
        <View key={event.id} style={styles.event}>
          <MaterialCommunityIcons
            name={DISPUTE_EVENT_ICONS[event.event] ?? 'information-outline'}
            size={18}
            color={palette.textMuted}
          />
          <View style={styles.grow}>
            <Text style={[textStyle('sm'), { color: palette.ink }]}>
              {disputeEventLabel(
                {
                  event: event.event,
                  actorRole: event.actorRole ?? null,
                  details: (event.details ?? null) as Record<string, unknown> | null,
                },
                viewer,
                names,
                currency
              )}
            </Text>
            <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
              {relativeTime(event.createdAt)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3] },
  list: { gap: spacing[2] },
  message: { borderRadius: radius.md, padding: spacing[3], gap: 2, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  strong: { fontWeight: fontWeight.semibold },
  composer: { gap: spacing[2] },
  closed: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  grow: { flex: 1, gap: 2 },
  event: { flexDirection: 'row', gap: spacing[3] },
});
