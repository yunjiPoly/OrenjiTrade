import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { useMyReports } from '@/src/api/hooks/reports';
import type { MyReport } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { Text } from '@/src/components/ui/Text';
import {
  isOpenReport,
  myReportStatusText,
  reportReasonLabel,
  reportStatusLabel,
} from '@/src/features/reports/reportLabels';
import { MY_REPORTS_COPY as COPY } from '@/src/features/settings/settingsCopy';
import { SettingsGroup, StatusPill, type PillTone } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, spacing, useTheme } from '@/src/theme';

/** The pill of a report's status: Open amber, Under review, Action taken teal, Dismissed grey. */
function pillTone(status: string): PillTone {
  switch (status) {
    case 'OPEN':
      return 'open';
    case 'UNDER_REVIEW':
      return 'review';
    case 'ACTIONED':
      return 'done';
    default:
      return 'closed';
  }
}

/**
 * Settings › My reports (stage R13, mockup v50 screen 55; web: `/settings/reports`,
 * `GET /me/reports`): the collectors the collector reported, newest first, each with its status
 * pill, the reason, when it was sent and reviewed, and where it stands. Decisions stay private: the
 * reporter only learns whether the team took action. A row opens the collector's profile.
 */
export default function MyReportsScreen() {
  const { palette } = useTheme();
  const reports = useMyReports();
  const list = reports.data ?? [];
  const open = list.filter((report) => isOpenReport(report.status)).length;

  let content;
  if (!reports.data) {
    content = reports.error ? (
      <ErrorState
        compact
        testID="reports-error"
        error={reports.error}
        title={COPY.loadError}
        onRetry={() => void reports.refetch()}
      />
    ) : (
      <View accessibilityLabel={COPY.loading} aria-busy>
        <SkeletonList rows={3} rowHeight={84} testID="reports-loading" />
      </View>
    );
  } else if (list.length === 0) {
    content = (
      <EmptyState
        testID="reports-empty"
        icon="shield-check-outline"
        title={COPY.emptyTitle}
        description={COPY.emptyText}
      />
    );
  } else {
    content = (
      <>
        <Text
          testID="reports-summary"
          accessibilityLiveRegion="polite"
          style={[styles.summary, { color: palette.settings.rowIcon }]}
        >
          <Text style={styles.strong}>{COPY.waiting(open)}</Text> ·{' '}
          {COPY.reviewed(list.length - open)}
        </Text>
        <SettingsGroup testID="reports-list">
          {list.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </SettingsGroup>
      </>
    );
  }

  return (
    <SettingsPage
      title={COPY.title}
      testID="screen-my-reports"
      refreshControl={
        <RefreshControl
          refreshing={reports.isRefetching}
          onRefresh={() => void reports.refetch()}
        />
      }
    >
      <Text style={[styles.intro, { color: palette.textMuted }]}>{COPY.intro}</Text>
      {content}
    </SettingsPage>
  );
}

function ReportRow({ report }: { report: MyReport }) {
  const { palette } = useTheme();
  const router = useRouter();
  const when = report.resolvedAt
    ? `${COPY.sent(relativeTime(report.createdAt))} · ${COPY.reviewedOn(relativeTime(report.resolvedAt))}`
    : COPY.sent(relativeTime(report.createdAt));
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={COPY.rowLabel(report.reportedUser.displayName)}
      accessibilityValue={{
        text: [
          reportStatusLabel(report.status),
          reportReasonLabel(report.reason),
          when,
          myReportStatusText(report),
        ].join(', '),
      }}
      onPress={() =>
        router.push({ pathname: '/collectors/[id]', params: { id: report.reportedUser.handle } })
      }
      testID={`report-${report.id}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar
        src={report.reportedUser.avatarUrl}
        name={report.reportedUser.displayName}
        size={40}
      />
      <View style={styles.words}>
        <View style={styles.head}>
          <Text style={[styles.name, { color: palette.ink }]}>
            {report.reportedUser.displayName}
          </Text>
          <StatusPill
            label={reportStatusLabel(report.status)}
            tone={pillTone(report.status)}
            testID={`report-status-${report.id}`}
          />
        </View>
        <Text
          testID={`report-reason-${report.id}`}
          style={[styles.reason, { color: palette.settings.rowIcon }]}
        >
          {reportReasonLabel(report.reason)}
        </Text>
        <Text style={[styles.when, { color: palette.textMuted }]}>{when}</Text>
        <Text
          testID={`report-status-text-${report.id}`}
          style={[styles.reason, { color: palette.textMuted }]}
        >
          {myReportStatusText(report)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20 },
  summary: { fontSize: 13, lineHeight: 18 },
  strong: { fontWeight: fontWeight.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: 14,
  },
  words: { flex: 1, minWidth: 0, gap: 2 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] },
  name: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold, flexShrink: 1 },
  reason: { fontSize: 13, lineHeight: 18 },
  when: { fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
