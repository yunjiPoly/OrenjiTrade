import { Observable, firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';

/** The line under every staff write's toast (spec 15.2). */
export const RECORDED = 'Recorded in the audit log.';

/**
 * Runs an audited staff write: on success a toast "{result}" with "Recorded in the audit log."
 * and the answer; on failure a toast with the friendly error (a 409 says `conflict` when given)
 * and `null`.
 */
export async function runConsoleAction<T>(
  toasts: ToastService,
  request: Observable<T>,
  success: string,
  conflict?: string,
): Promise<T | null> {
  try {
    const result = await firstValueFrom(request);
    toasts.show({ title: success, sub: RECORDED });
    return result;
  } catch (error) {
    const apiError: ApiError = toApiError(error);
    toasts.show({
      title: apiError.status === 409 && conflict ? conflict : friendlyMessage(apiError),
      sub: apiError.requestId ? `Request ${apiError.requestId}` : null,
      tone: 'error',
    });
    return null;
  }
}
