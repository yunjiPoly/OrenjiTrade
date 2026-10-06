import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import type { MyReport, ReportContextSource } from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';

/**
 * Vocabulary of collector reports (Phase 7 contract, mirror of the web's
 * `shared/reports/report-labels.ts` and `report-errors.ts`). The report screen itself lists the
 * server's reasons (`GET /public/report-reasons`, dialog order); these labels cover "My reports"
 * and older servers.
 */

/** Longest free text a reporter may add (`details`, contract: ≤ 1000). */
export const REPORT_DETAILS_MAX = 1000;

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

export function reportStatusIcon(status: string | null | undefined): IconName {
  return isOpenReport(status) ? 'timer-sand' : 'check-circle-outline';
}

export const CONTEXT_SOURCES: readonly ReportContextSource[] = [
  'PROFILE',
  'CONVERSATION',
  'POST',
  'BINDER',
];

/** Where a report is filed from (`context` of `POST /reports/collectors`). */
export interface ReportContextInput {
  source: ReportContextSource;
  conversationId?: string;
  postId?: string;
  binderId?: string;
}

/** Inline problem of the report screen. `alreadyOpen` keeps the reasons disabled. */
export interface ReportProblem {
  message: string;
  alreadyOpen: boolean;
}

/**
 * Wording of the answers `POST /reports/collectors` can refuse with: 409 REPORT_ALREADY_OPEN,
 * 422 CANNOT_REPORT_SELF, 404 (the collector is gone), 400 (a context that is not the
 * reporter's, details too long), 429 (five reports a day). Anything else falls back to the
 * shared friendly wording.
 */
export function reportProblem(error: ApiError, displayName: string): ReportProblem {
  if (error.status === 409 || error.errorCode === 'REPORT_ALREADY_OPEN') {
    return {
      message:
        `You already reported ${displayName}. Our moderation team is reviewing it, and you ` +
        'will be notified when it is decided. You can follow it in Settings → My reports.',
      alreadyOpen: true,
    };
  }
  if (error.errorCode === 'CANNOT_REPORT_SELF') {
    return { message: 'You cannot report yourself.', alreadyOpen: false };
  }
  if (error.status === 404) {
    return {
      message: `${displayName} is no longer available on OrenjiTrade.`,
      alreadyOpen: false,
    };
  }
  if (error.status === 429) {
    return {
      message:
        'You sent several reports today. Please try again tomorrow, or block the collector ' +
        'in the meantime.',
      alreadyOpen: false,
    };
  }
  if (error.status === 400 && error.errorCode === 'VALIDATION_FAILED') {
    return {
      message: error.fieldErrors['details']
        ? 'The details are too long (1,000 characters at most).'
        : 'This report could not be sent from here. Report the collector from their profile.',
      alreadyOpen: false,
    };
  }
  return { message: friendlyMessage(error), alreadyOpen: false };
}

/** Route params of the report screen for a collector and where they were reported from. */
export function reportParams(
  target: { id: string; displayName: string; handle?: string | null },
  context: ReportContextInput
): Record<string, string> {
  return {
    userId: target.id,
    name: target.displayName,
    ...(target.handle ? { handle: target.handle } : {}),
    source: context.source,
    ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    ...(context.postId ? { postId: context.postId } : {}),
    ...(context.binderId ? { binderId: context.binderId } : {}),
  };
}

const ID = /^[\w-]{1,64}$/;

/** The report screen's target and context from its route params (`null` when unusable). */
export function parseReportParams(params: Record<string, string | string[] | undefined>): {
  target: { id: string; displayName: string; handle: string | null };
  context: ReportContextInput;
} | null {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : null;
  };
  const userId = one('userId');
  if (!userId || !ID.test(userId)) {
    return null;
  }
  const rawSource = one('source');
  const source = CONTEXT_SOURCES.includes(rawSource as ReportContextSource)
    ? (rawSource as ReportContextSource)
    : 'PROFILE';
  const id = (key: string) => {
    const value = one(key);
    return value && ID.test(value) ? value : undefined;
  };
  const context: ReportContextInput = { source };
  if (source === 'CONVERSATION' && id('conversationId')) {
    context.conversationId = id('conversationId');
  }
  if (source === 'POST' && id('postId')) {
    context.postId = id('postId');
  }
  if (source === 'BINDER' && id('binderId')) {
    context.binderId = id('binderId');
  }
  const handle = one('handle');
  return {
    target: {
      id: userId,
      displayName: one('name')?.trim() || 'this collector',
      handle: handle && /^[\w.-]{1,40}$/.test(handle) ? handle : null,
    },
    context,
  };
}
