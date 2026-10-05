import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { useListingStatus, useResumeListings } from '@/src/api/hooks/inventory';
import type { ListingStatus } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

function waiting(status: ListingStatus): string {
  const count = Math.max(status.strikes, status.unansweredConversations30d);
  return count === 1 ? '1 conversation' : `${count} conversations`;
}

function untilDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : ` until ${date.toISOString().slice(0, 10)}`;
}

/**
 * Listing health on the Inventory tab (web: `app-listings-paused-banner`,
 * `GET /me/listings/status`): when the public listings are paused, a banner with "Resume
 * listings" for pauses of the unresponsiveness check (`POST /me/listings/resume`) or "under
 * review" for moderation pauses; a gentle reminder while unanswered conversations count as
 * strikes. Nothing otherwise, or when the status cannot be read.
 */
export function ListingsPausedBanner() {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const status = useListingStatus();
  const resume = useResumeListings();
  const [asking, setAsking] = useState(false);
  const data = status.data;
  if (!data || (!data.paused && data.strikes <= 0)) {
    return null;
  }

  const doResume = async () => {
    try {
      await resume.mutateAsync();
      setAsking(false);
      snackbar.show('Your public listings are visible again.');
    } catch (error) {
      setAsking(false);
      snackbar.show(friendlyMessage(error as ApiError), { tone: 'error' });
    }
  };

  if (!data.paused) {
    return (
      <View
        testID="listings-strikes"
        accessibilityRole="summary"
        style={[
          styles.banner,
          { borderColor: palette.warning, backgroundColor: palette.surfaceVariant },
        ]}
      >
        <MaterialCommunityIcons name="message-alert-outline" size={20} color={palette.warning} />
        <Text style={[textStyle('sm'), styles.grow, { color: palette.ink }]}>
          <Text style={styles.bold}>{waiting(data)} waiting for your answer. </Text>
          After {data.maxStrikes} unanswered conversations your public listings pause until you
          confirm you are available.
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="listings-paused"
      accessibilityRole="alert"
      style={[
        styles.banner,
        styles.column,
        { borderColor: palette.danger, backgroundColor: palette.surfaceVariant },
      ]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons name="pause-circle-outline" size={22} color={palette.danger} />
        <Text style={[textStyle('md'), styles.bold, styles.grow, { color: palette.ink }]}>
          Your public listings are paused
        </Text>
      </View>
      <Text style={[textStyle('sm'), { color: palette.ink }]}>
        {data.canResume
          ? `${waiting(data)} are waiting for your answer, so collectors cannot see your public binders and cards for now. Reply to them, then confirm you are available again. Your inventory is unchanged.`
          : `The moderation team is reviewing your account${untilDate(data.pausedUntil)}. Your public listings are hidden until the review is complete; your inventory is unchanged.`}
      </Text>
      {data.canResume ? (
        <Button
          label="Resume listings"
          icon="play-circle-outline"
          onPress={() => setAsking(true)}
          testID="listings-resume"
        />
      ) : null}
      <ConfirmDialog
        visible={asking}
        title="Show your listings again?"
        message="Confirm that you are available to answer collectors. Your public binders and cards become visible on the map and in search again, and the unanswered conversation count starts over."
        confirmLabel="Resume listings"
        busy={resume.isPending}
        onConfirm={() => void doResume()}
        onCancel={() => setAsking(false)}
        testID="listings-resume-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  column: { flexDirection: 'column', alignItems: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  grow: { flex: 1 },
  bold: { fontWeight: fontWeight.semibold },
});
