import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys, publicKeys } from '../queryKeys';
import type {
  MyReport,
  ReportCollectorRequest,
  ReportConfirmation,
  ReportReasonOption,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/public/report-reasons`: the reasons of the "Report collector" dialog in the
 * server's order (= the dialog order), read once per session and shared by every entry point.
 */
export function useReportReasons() {
  return useQuery<ReportReasonOption[], ApiError>({
    queryKey: publicKeys.reportReasons,
    queryFn: async () => required((await api.GET('/api/v1/public/report-reasons')).data),
    staleTime: Infinity,
  });
}

/**
 * `POST /api/v1/reports/collectors` with an `Idempotency-Key` the caller keeps for the whole
 * dialog (a double submit or a retry after a lost answer repeats the first answer). Refusals:
 * 409 `REPORT_ALREADY_OPEN`, 422 `CANNOT_REPORT_SELF`, 404, 400 (a context that is not the
 * reporter's, details > 1000) and 429 (five reports a day). "My reports" is refreshed.
 */
export function useReportCollector() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<
    ReportConfirmation,
    ApiError,
    { body: ReportCollectorRequest; idempotencyKey: string }
  >({
    mutationFn: async ({ body, idempotencyKey }) =>
      required(
        (
          await api.POST('/api/v1/reports/collectors', {
            params: { header: { 'Idempotency-Key': idempotencyKey } },
            body,
          })
        ).data
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.reports(uid) });
    },
  });
}

/**
 * `GET /api/v1/me/reports`: the collectors the caller reported (newest first, at most 100) with
 * where each review stands; decisions stay private (the reporter only sees the status).
 */
export function useMyReports() {
  const uid = useUid();
  return useQuery<MyReport[], ApiError>({
    queryKey: meKeys.reports(uid),
    queryFn: async () => {
      const reports = required((await api.GET('/api/v1/me/reports')).data);
      return [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    enabled: useIsAuthenticated(),
  });
}
