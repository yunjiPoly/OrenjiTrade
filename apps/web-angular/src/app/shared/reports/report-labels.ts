import type {
  MyReport,
  ReportDetailResolutionActionEnum,
  ReportReasonOptionCodeEnum,
  ReportSummaryContextSourceEnum,
  ReportSummaryStatusEnum,
} from '@orenji/api-client';

/**
 * Vocabulary of collector reports (Phase 7 contract) shared by the report dialog, Settings → My
 * reports and the admin console. The dialog itself shows the server's reasons
 * (`GET /public/report-reasons`, dialog order); these labels cover lists and older servers.
 */

export type ReportReason = `${ReportReasonOptionCodeEnum}`;
export type ReportStatus = `${ReportSummaryStatusEnum}`;
export type ReportContextSource = `${ReportSummaryContextSourceEnum}`;
export type ResolutionAction = `${ReportDetailResolutionActionEnum}`;

/** Reason codes in the order of the product spec (the dialog order). */
export const REPORT_REASONS: readonly ReportReason[] = [
  'SCAM',
  'COUNTERFEIT',
  'HARASSMENT',
  'SPAM',
  'INAPPROPRIATE_BEHAVIOR',
  'MISLEADING_LISTINGS',
  'OTHER',
];

export const REPORT_REASON_LABELS: Record<string, string> = {
  SCAM: 'Scam or fraud',
  COUNTERFEIT: 'Counterfeit cards',
  HARASSMENT: 'Harassment',
  SPAM: 'Spam',
  INAPPROPRIATE_BEHAVIOR: 'Inappropriate behaviour',
  MISLEADING_LISTINGS: 'Misleading listings',
  OTHER: 'Something else',
};

export function reportReasonLabel(reason: string | null | undefined): string {
  return reason ? (REPORT_REASON_LABELS[reason] ?? reason) : '';
}

export const REPORT_STATUSES: readonly ReportStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'ACTIONED',
  'DISMISSED',
];

export const REPORT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under review',
  ACTIONED: 'Action taken',
  DISMISSED: 'Dismissed',
};

export function reportStatusLabel(status: string | null | undefined): string {
  return status ? (REPORT_STATUS_LABELS[status] ?? status) : '';
}

/** What the reporter sees about their own report (never the decision's specifics). */
export function myReportStatusText(report: Pick<MyReport, 'status'>): string {
  switch (report.status) {
    case 'OPEN':
      return 'Waiting for a moderator';
    case 'UNDER_REVIEW':
      return 'A moderator is reviewing it';
    case 'ACTIONED':
      return 'Reviewed — the team took action';
    case 'DISMISSED':
      return 'Reviewed — no violation found';
    default:
      return reportStatusLabel(report.status);
  }
}

/** True while a report is still waiting for a decision. */
export function isOpenReport(status: string | null | undefined): boolean {
  return status === 'OPEN' || status === 'UNDER_REVIEW';
}

export const CONTEXT_SOURCE_LABELS: Record<string, string> = {
  PROFILE: 'Profile',
  CONVERSATION: 'Conversation',
  POST: 'Community post',
  BINDER: 'Public binder',
};

export function contextSourceLabel(source: string | null | undefined): string {
  return source ? (CONTEXT_SOURCE_LABELS[source] ?? source) : '';
}

export const RESOLUTION_ACTIONS: readonly ResolutionAction[] = [
  'NONE',
  'WARNING',
  'LISTINGS_PAUSED',
  'SUSPENDED',
  'BANNED',
];

export const RESOLUTION_ACTION_LABELS: Record<string, string> = {
  NONE: 'No action',
  WARNING: 'Warning',
  LISTINGS_PAUSED: 'Listings paused',
  SUSPENDED: 'Suspended',
  BANNED: 'Banned',
};

export function resolutionActionLabel(action: string | null | undefined): string {
  return action ? (RESOLUTION_ACTION_LABELS[action] ?? action) : '';
}

/** Longest free text a reporter may add (`details`, contract: ≤ 1000). */
export const REPORT_DETAILS_MAX = 1000;
