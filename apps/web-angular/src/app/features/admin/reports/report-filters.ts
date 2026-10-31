import type { ListReportsRequestParams } from '@orenji/api-client';
import { REPORT_REASONS } from '../../../shared/reports/report-labels';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The status tabs of the Reports page (spec 15.4, board A2). */
export const REPORT_TABS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'ACTIONED', label: 'Action taken' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'ALL', label: 'All' },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]['value'];

/** The URL's filters (`?status=&reason=&mine=1&reportedUserId=&page=`), as typed. */
export interface ReportQuery {
  status?: string;
  reason?: string;
  mine?: string;
  reportedUserId?: string;
  page?: string;
}

/**
 * The tab of a URL: Open by default, `ALL` for every status. A list scoped to the caller's reports
 * ("Assigned to me") or to one collector ("All reports about them") shows All by default (review
 * fix 1): assigning a report moves it to Under review, so Open plus "mine" could list nothing,
 * and a collector's reports are read in every state.
 */
export function reportTabOf(status: string | undefined, scoped = false): ReportTab {
  return (REPORT_TABS.find((tab) => tab.value === status)?.value ??
    (scoped ? 'ALL' : 'OPEN')) as ReportTab;
}

/** Whether a URL scopes the list to the caller's reports or to one collector. */
export function scopedQuery(query: Pick<ReportQuery, 'mine' | 'reportedUserId'>): boolean {
  return query.mine === '1' || UUID.test(query.reportedUserId ?? '');
}

/** The list request of a URL: unknown values are left out, the caller's id for "mine". */
export function reportListParams(
  query: ReportQuery,
  myId: string | null,
  size: number,
): ListReportsRequestParams {
  const tab = reportTabOf(query.status, scopedQuery(query));
  const reason = query.reason ?? '';
  const subject = query.reportedUserId ?? '';
  const page = Number.parseInt(query.page ?? '', 10);
  return {
    status: tab === 'ALL' ? undefined : tab,
    reason: (REPORT_REASONS as readonly string[]).includes(reason)
      ? (reason as ListReportsRequestParams['reason'])
      : undefined,
    reportedUserId: UUID.test(subject) ? subject : undefined,
    assignedTo: query.mine === '1' && myId ? myId : undefined,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size,
  };
}

/** The count line above the list ("2 reports waiting for a moderator"). */
export function reportCountLine(tab: ReportTab, total: number): string {
  const reports = `${total} ${total === 1 ? 'report' : 'reports'}`;
  switch (tab) {
    case 'OPEN':
      return `${reports} waiting for a moderator`;
    case 'UNDER_REVIEW':
      return `${reports} under review`;
    case 'ACTIONED':
      return `${reports} with action taken`;
    case 'DISMISSED':
      return `${reports} dismissed`;
    default:
      return reports;
  }
}

/** "1–20 of 45 · 20 per page" */
export function pageRangeLine(page: number, size: number, total: number): string {
  if (total === 0) {
    return `0 of 0 · ${size} per page`;
  }
  const first = page * size + 1;
  const last = Math.min(total, (page + 1) * size);
  return `${first}–${last} of ${total} · ${size} per page`;
}
