import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useEvidencePhoto } from '@/src/api/hooks/payments';
import type { DisputeEvidence } from '@/src/api/types';
import { evidenceKindInfo, fileSize } from '@/src/features/payments/paymentLabels';
import { formatDateTime } from '@/src/lib/dates';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

export interface EvidenceView {
  item: DisputeEvidence;
  kind: string;
  who: string;
  mine: boolean;
  /** An https tracking link (TRACKING evidence), never anything else. */
  link: string | null;
}

/** Evidence in words: its kind, who added it ("You", a party's name or OrenjiTrade). */
export function evidenceViews(
  evidence: readonly DisputeEvidence[],
  viewer: string | null | undefined,
  names: { BUYER: string; SELLER: string }
): EvidenceView[] {
  return evidence.map((item) => {
    const mine = !!viewer && item.role === viewer;
    const who = mine
      ? 'You'
      : item.role === 'BUYER'
        ? names.BUYER
        : item.role === 'SELLER'
          ? names.SELLER
          : 'OrenjiTrade';
    const link = item.url && /^https:\/\//i.test(item.url) ? item.url : null;
    return { item, kind: evidenceKindInfo(item.kind).label, who, mine, link };
  });
}

/** A photo of IMAGE evidence, loaded through the authenticated file route. */
function EvidencePhoto({
  disputeId,
  item,
  who,
}: {
  disputeId: string;
  item: DisputeEvidence;
  who: string;
}) {
  const { palette } = useTheme();
  const photo = useEvidencePhoto(disputeId, item.id);
  if (photo.data) {
    return (
      <Image
        source={{ uri: photo.data }}
        style={styles.photo}
        contentFit="contain"
        cachePolicy="none"
        accessibilityLabel={`Photo from ${who}`}
        testID="evidence-image"
      />
    );
  }
  if (photo.error) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="evidence-image-error">
        The photo could not load.
      </Text>
    );
  }
  return <ActivityIndicator accessibilityLabel="Loading the photo" color={palette.primary} />;
}

/**
 * The evidence of a dispute (web: `app-evidence-list`): each piece with its kind, who added it
 * and when; photos (fetched with the ID token, never through a public URL), PDF documents by
 * name and size, statements and tracking links.
 */
export function EvidenceList({
  disputeId,
  evidence,
  viewer,
  names,
}: {
  disputeId: string;
  evidence: readonly DisputeEvidence[];
  viewer: string | null | undefined;
  names: { BUYER: string; SELLER: string };
}) {
  const { palette } = useTheme();
  const views = evidenceViews(evidence, viewer, names);
  if (views.length === 0) {
    return (
      <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="evidence-empty">
        No evidence yet.
      </Text>
    );
  }
  return (
    <View style={styles.list} accessibilityLabel="Evidence">
      {views.map((view) => (
        <View
          key={view.item.id}
          testID="evidence-item"
          style={[
            styles.item,
            {
              backgroundColor: view.mine ? palette.surfaceVariant : palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.head}>
            <MaterialCommunityIcons
              name={evidenceKindInfo(view.item.kind).icon}
              size={16}
              color={palette.textMuted}
            />
            <Text style={[textStyle('sm'), styles.strong, { color: palette.ink }]}>
              {view.kind}
            </Text>
            <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
              {view.who} · {formatDateTime(view.item.createdAt)}
            </Text>
          </View>
          {view.item.kind === 'IMAGE' ? (
            <EvidencePhoto disputeId={disputeId} item={view.item} who={view.who} />
          ) : null}
          {view.item.kind === 'DOCUMENT' ? (
            <Text style={[textStyle('sm'), { color: palette.ink }]} testID="evidence-document">
              PDF document{view.item.sizeBytes ? ` (${fileSize(view.item.sizeBytes)})` : ''} — open
              it on orenjitrade.com
            </Text>
          ) : null}
          {view.item.body ? (
            <Text style={[textStyle('sm'), { color: palette.ink }]} testID="evidence-body">
              {view.item.body}
            </Text>
          ) : null}
          {view.link ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(view.link ?? '')}
              style={styles.head}
            >
              <MaterialCommunityIcons name="open-in-new" size={16} color={palette.accent} />
              <Text style={[textStyle('sm'), styles.link, { color: palette.accent }]}>
                Follow the tracking
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[2] },
  item: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], gap: spacing[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  link: { textDecorationLine: 'underline' },
  photo: { width: '100%', height: 220, borderRadius: radius.sm },
});
