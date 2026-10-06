import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { newRequestId } from '@/src/api/client';
import { useReportCollector, useReportReasons } from '@/src/api/hooks/reports';
import type { ReportConfirmation, ReportReason } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage, RadioGroup } from '@/src/components/ui/FormControls';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { TextField } from '@/src/components/ui/TextField';
import {
  REPORT_DETAILS_MAX,
  parseReportParams,
  reportProblem,
  type ReportProblem,
} from '@/src/features/reports/reportLabels';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * "Report collector" (the web's report dialog, product spec § 23), opened from a profile, the map
 * preview, a conversation, a community post or a public binder (`?userId=&name=&source=` plus
 * the conversation, post or binder id). "Why are you reporting this user?" with the server's
 * reasons in their order, optional details (≤ 1000), Confirm once a reason is chosen: sent with
 * an `Idempotency-Key` fixed for the screen. Refusals (409 already open, 422 self, 404, 429 five
 * a day) are explained; success turns into a confirmation that links to My reports.
 */
export default function ReportCollectorScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const parsed = parseReportParams(params);
  const reasons = useReportReasons();
  const report = useReportCollector();
  const [idempotencyKey] = useState(() => newRequestId());
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [problem, setProblem] = useState<ReportProblem | null>(null);
  const [sent, setSent] = useState<ReportConfirmation | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!parsed) {
    return (
      <Screen testID="screen-report">
        <EmptyState
          testID="report-invalid"
          icon="flag-off-outline"
          title="Nobody to report here"
          description="Open the collector's profile and report them from there."
          actionLabel="Back"
          onAction={close}
        />
      </Screen>
    );
  }
  const { target, context } = parsed;

  if (sent) {
    return (
      <Screen scroll safeBottom testID="screen-report">
        <Stack.Screen options={{ title: 'Report sent' }} />
        <View style={styles.done} testID="report-sent" accessibilityLiveRegion="polite">
          <View style={[styles.doneIcon, { backgroundColor: palette.surfaceVariant }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={32} color={palette.success} />
          </View>
          <Text
            accessibilityRole="header"
            style={[textStyle('xl', 'heading'), styles.center, { color: palette.ink }]}
          >
            Report sent
          </Text>
          <Text style={[textStyle('md'), styles.center, { color: palette.ink }]}>
            Thank you. Our moderation team will review your report about {target.displayName}. They
            are not told who reported them.
          </Text>
          <Text style={[textStyle('sm'), styles.center, { color: palette.textMuted }]}>
            You will get a notification once the review is complete. Follow it any time in Settings
            → My reports.
          </Text>
          <Button label="Done" onPress={close} testID="report-done" />
          <Button
            label="My reports"
            variant="secondary"
            icon="flag-outline"
            onPress={() => router.replace('/settings/reports')}
            testID="report-my-reports"
          />
        </View>
      </Screen>
    );
  }

  const blocked = problem?.alreadyOpen === true;
  const tooLong = details.length > REPORT_DETAILS_MAX;
  const canConfirm = !!reason && !tooLong && !report.isPending && !blocked;

  const submit = async () => {
    if (!reason || !canConfirm) {
      return;
    }
    setProblem(null);
    const text = details.trim();
    try {
      const confirmation = await report.mutateAsync({
        idempotencyKey,
        body: {
          reportedUserId: target.id,
          reason,
          ...(text ? { details: text } : {}),
          context: {
            source: context.source,
            ...(context.conversationId ? { conversationId: context.conversationId } : {}),
            ...(context.postId ? { postId: context.postId } : {}),
            ...(context.binderId ? { binderId: context.binderId } : {}),
          },
        },
      });
      setSent(confirmation);
    } catch (error) {
      setProblem(
        isApiError(error)
          ? reportProblem(error, target.displayName)
          : { message: 'The report could not be sent. Please try again.', alreadyOpen: false }
      );
    }
  };

  let reasonList;
  if (reasons.data) {
    reasonList = (
      <RadioGroup<string>
        label="Why are you reporting this user?"
        options={reasons.data.map((option) => ({
          value: option.code,
          label: option.label,
          help: option.description,
        }))}
        value={reason ?? ''}
        onChange={(code) => setReason(code as ReportReason)}
        disabled={report.isPending || blocked}
        testID="report-reason"
      />
    );
  } else if (reasons.error) {
    reasonList = (
      <ErrorState
        compact
        testID="report-reasons-error"
        error={reasons.error}
        title="The reasons could not load"
        onRetry={() => void reasons.refetch()}
      />
    );
  } else {
    reasonList = (
      <View accessibilityLabel="Loading the reasons" aria-busy>
        <SkeletonList rows={4} rowHeight={48} testID="report-reasons-loading" />
      </View>
    );
  }

  return (
    <Screen scroll safeBottom testID="screen-report">
      <Stack.Screen options={{ title: 'Report collector' }} />
      <View style={styles.form}>
        <View style={[styles.who, { backgroundColor: palette.surfaceVariant }]}>
          <Avatar name={target.displayName} size={40} />
          <View style={styles.grow}>
            <Text
              testID="report-target"
              style={[textStyle('md'), styles.strong, { color: palette.ink }]}
            >
              {target.displayName}
            </Text>
            {target.handle ? (
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>@{target.handle}</Text>
            ) : null}
          </View>
        </View>

        <Text
          accessibilityRole="header"
          style={[textStyle('md'), styles.strong, { color: palette.ink }]}
        >
          Why are you reporting this user?
        </Text>
        {reasonList}

        <TextField
          label="Details (optional)"
          value={details}
          onChangeText={setDetails}
          placeholder="What happened? Dates, cards or messages help the moderators."
          multiline
          maxLength={REPORT_DETAILS_MAX + 50}
          editable={!report.isPending}
          error={tooLong ? `Keep the details under ${REPORT_DETAILS_MAX} characters.` : null}
          hint={`${details.length} / ${REPORT_DETAILS_MAX}`}
          testID="report-details"
        />

        <View style={styles.privacy}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={palette.textMuted} />
          <Text style={[textStyle('xs'), styles.grow, { color: palette.textMuted }]}>
            Reports are confidential and reviewed by the OrenjiTrade moderation team. False reports
            can lead to action on your own account.
          </Text>
        </View>

        {problem ? (
          <FormMessage tone={problem.alreadyOpen ? 'info' : 'error'} testID="report-error">
            {problem.message}
          </FormMessage>
        ) : null}
        {blocked ? (
          <Button
            label="My reports"
            variant="secondary"
            icon="flag-outline"
            onPress={() => router.replace('/settings/reports')}
            testID="report-open-my-reports"
          />
        ) : null}

        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" onPress={close} style={styles.grow} />
          <Button
            label="Confirm"
            loading={report.isPending}
            loadingLabel="Sending…"
            disabled={!canConfirm}
            onPress={() => void submit()}
            style={styles.grow}
            testID="report-confirm"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4] },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  grow: { flex: 1 },
  strong: { fontWeight: fontWeight.semibold },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  actions: { flexDirection: 'row', gap: spacing[2] },
  done: { gap: spacing[3], alignItems: 'stretch', paddingVertical: spacing[6] },
  doneIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
