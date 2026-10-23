import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/src/api/ApiError';
import { newRequestId } from '@/src/api/client';
import { useReportCollector, useReportReasons } from '@/src/api/hooks/reports';
import type { ReportConfirmation, ReportReason } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import { TextField } from '@/src/components/ui/TextField';
import { StatusActions, StatusBody, StatusText } from '@/src/features/account/StatusPage';
import { PersonHeader } from '@/src/features/collectors/PersonHeader';
import { REPORT_COPY as COPY } from '@/src/features/reports/reportCopy';
import {
  REPORT_DETAILS_MAX,
  parseReportParams,
  reportProblem,
  type ReportProblem,
} from '@/src/features/reports/reportLabels';
import { SettingsRadios } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

/**
 * Report a collector (mockup v50 screen 60, stage R14; the web's report dialog, product spec
 * § 23), opened from the "⋯" of a profile, a chat or a community post (and a public binder or
 * deck core): `?userId=&name=&handle=&source=` plus the conversation, post or binder id. The
 * collector with their picture and "@handle · {province}", the server's reasons as radio rows with
 * their line (`GET /public/report-reasons`, dialog order), Details (≤ 1000), the confidentiality
 * note and "Send report", grey with "Choose a reason first." until a reason is chosen; sent with an
 * `Idempotency-Key` fixed for the screen. Refusals (409 already open, 422 self, 404, 429 five a
 * day) are explained in place; a sent report turns the screen into "Report sent" with "Done" and
 * "Follow it in My reports".
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
  const myReports = () => router.replace('/settings/reports');

  if (!parsed) {
    return (
      <SettingsPage title={COPY.title} onBack={close} testID="screen-report">
        <EmptyState
          testID="report-invalid"
          icon="flag-off-outline"
          title={COPY.invalidTitle}
          description={COPY.invalidBody}
          actionLabel={COPY.back}
          onAction={close}
        />
      </SettingsPage>
    );
  }
  const { target, context } = parsed;

  if (sent) {
    return (
      <SettingsPage title={COPY.sentTitle} onBack={close} testID="screen-report">
        <View style={styles.sent} testID="report-sent" accessibilityLiveRegion="polite">
          <StatusBody icon="check" tone="accent" title={COPY.sentTitle} paddingTop={60}>
            <StatusText>{COPY.sentBody(target.displayName)}</StatusText>
          </StatusBody>
          <StatusActions>
            <PillButton label={COPY.done} onPress={close} testID="report-done" />
            <PillButton
              label={COPY.follow}
              variant="outline"
              onPress={myReports}
              testID="report-my-reports"
            />
          </StatusActions>
        </View>
      </SettingsPage>
    );
  }

  const blocked = problem?.alreadyOpen === true;
  const tooLong = details.length > REPORT_DETAILS_MAX;
  const canSend = !!reason && !tooLong && !report.isPending && !blocked;

  const submit = async () => {
    if (!reason || !canSend) {
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
          : { message: COPY.sendFailed, alreadyOpen: false }
      );
    }
  };

  let reasonList;
  if (reasons.data) {
    reasonList = (
      <SettingsRadios<string>
        title={COPY.reasonsTitle}
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
        title={COPY.reasonsError}
        onRetry={() => void reasons.refetch()}
      />
    );
  } else {
    reasonList = (
      <View accessibilityLabel={COPY.reasonsLoading} aria-busy>
        <SkeletonList rows={4} rowHeight={56} testID="report-reasons-loading" />
      </View>
    );
  }

  // A refusal is said in the bar, where "Send report" was pressed (the walk: at the end of the
  // page it was under the fold, and the grey button said nothing).
  const footer = (
    <>
      {problem ? (
        <FormMessage tone={problem.alreadyOpen ? 'info' : 'error'} testID="report-error">
          {problem.message}
        </FormMessage>
      ) : null}
      {blocked ? (
        <PillButton
          label={COPY.myReports}
          variant="outline"
          onPress={myReports}
          testID="report-open-my-reports"
        />
      ) : null}
      <PillButton
        label={COPY.send}
        loading={report.isPending}
        loadingLabel={COPY.sending}
        disabled={!canSend}
        onPress={() => void submit()}
        accessibilityHint={!reason ? COPY.chooseFirst : undefined}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="report-confirm"
      />
      {!reason && !blocked ? (
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.why, { color: palette.textMuted }]}
          testID="report-choose-first"
        >
          {COPY.chooseFirst}
        </Text>
      ) : null}
    </>
  );

  return (
    <SettingsPage title={COPY.title} onBack={close} footer={footer} testID="screen-report">
      <PersonHeader
        displayName={target.displayName}
        handle={target.handle}
        nameTestID="report-target"
        testID="report-person"
      />
      {reasonList}

      <TextField
        label={COPY.details}
        labelAside={COPY.detailsCount(details.length, REPORT_DETAILS_MAX)}
        value={details}
        onChangeText={setDetails}
        placeholder={COPY.detailsPlaceholder}
        multiline
        maxLength={REPORT_DETAILS_MAX + 50}
        editable={!report.isPending}
        error={tooLong ? COPY.detailsTooLong(REPORT_DETAILS_MAX) : null}
        inputStyle={styles.details}
        textAlignVertical="top"
        testID="report-details"
      />

      <View
        style={[styles.note, { backgroundColor: palette.surface, borderColor: palette.border }]}
        testID="report-confidential"
      >
        <MaterialCommunityIcons
          name="shield-outline"
          size={18}
          color={palette.textMuted}
          style={styles.noteIcon}
        />
        <Text style={[styles.noteText, { color: palette.settings.segmentText }]}>
          {COPY.confidential}
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  sent: { flexGrow: 1 },
  details: { height: 88 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
  why: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
