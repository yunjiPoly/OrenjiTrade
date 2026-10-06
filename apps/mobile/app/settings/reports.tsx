import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMyReports } from '@/src/api/hooks/reports';
import type { MyReport } from '@/src/api/types';
import { Avatar } from '@/src/components/ui/Avatar';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import {
  isOpenReport,
  myReportStatusText,
  reportReasonLabel,
  reportStatusIcon,
  reportStatusLabel,
} from '@/src/features/reports/reportLabels';
import { relativeTime } from '@/src/lib/relativeTime';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Settings → My reports (the web's `/settings/reports`, `GET /me/reports`): the collectors the
 * caller reported, with the reason and where each review stands. Decisions stay private: the
 * reporter only learns whether the team took action (REPORT_DECISION notifications open here).
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
        title="Your reports could not load"
        onRetry={() => void reports.refetch()}
      />
    ) : (
      <View accessibilityLabel="Loading your reports" aria-busy>
        <SkeletonList rows={3} rowHeight={72} testID="reports-loading" />
      </View>
    );
  } else if (list.length === 0) {
    content = (
      <EmptyState
        testID="reports-empty"
        icon="shield-check-outline"
        title="You have not reported anyone"
        description="If a collector scams, harasses or misleads you, use Report on their profile, in the conversation menu or on their community post."
      />
    );
  } else {
    content = (
      <>
        <Text
          testID="reports-summary"
          accessibilityLiveRegion="polite"
          style={[textStyle('sm'), { color: palette.textMuted }]}
        >
          {open} waiting for a decision · {list.length - open} reviewed
        </Text>
        <View style={styles.list} accessibilityLabel="My reports">
          {list.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </View>
      </>
    );
  }

  return (
    <ScrollView
      testID="screen-my-reports"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={reports.isRefetching}
          onRefresh={() => void reports.refetch()}
        />
      }
    >
      <SectionCard
        title="My reports"
        description="Collectors you reported and where each review stands. Reports are confidential: the reported collector is never told who reported them, and the details of a decision stay with the moderation team."
      >
        {content}
      </SectionCard>
    </ScrollView>
  );
}

function ReportRow({ report }: { report: MyReport }) {
  const { palette } = useTheme();
  const router = useRouter();
  const openReport = isOpenReport(report.status);
  const color = openReport ? palette.warning : palette.success;
  return (
    <View style={[styles.row, { borderTopColor: palette.border }]} testID={`report-${report.id}`}>
      <Avatar
        src={report.reportedUser.avatarUrl}
        name={report.reportedUser.displayName}
        size={36}
      />
      <View style={styles.grow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${report.reportedUser.displayName}. Opens their profile.`}
          onPress={() =>
            router.push({
              pathname: '/collectors/[id]',
              params: { id: report.reportedUser.handle },
            })
          }
        >
          <Text style={[textStyle('md'), styles.strong, { color: palette.ink }]}>
            {report.reportedUser.displayName}
          </Text>
        </Pressable>
        <Text
          testID={`report-reason-${report.id}`}
          style={[textStyle('xs'), { color: palette.textMuted }]}
        >
          {reportReasonLabel(report.reason)}
        </Text>
        <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
          Sent {relativeTime(report.createdAt)}
          {report.resolvedAt ? ` · reviewed ${relativeTime(report.resolvedAt)}` : ''}
        </Text>
        <Text
          testID={`report-status-text-${report.id}`}
          style={[textStyle('sm'), { color: palette.ink }]}
        >
          {myReportStatusText(report)}
        </Text>
      </View>
      <View
        testID={`report-status-${report.id}`}
        accessible
        accessibilityLabel={`Status: ${reportStatusLabel(report.status)}`}
        style={[styles.status, { borderColor: color }]}
      >
        <MaterialCommunityIcons name={reportStatusIcon(report.status)} size={14} color={color} />
        <Text style={[textStyle('xs'), styles.strong, { color: palette.ink }]}>
          {reportStatusLabel(report.status)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[4], paddingBottom: spacing[10] },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1, gap: 2 },
  strong: { fontWeight: fontWeight.semibold },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
});
