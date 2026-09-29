import { HttpErrorResponse } from '@angular/common/http';

/** Shape of the RFC 9457 Problem Details body produced by the API (`ProblemDetail` in the contract). */
export interface ProblemDetailBody {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errorCode?: string;
  message?: string;
  requestId?: string;
  timestamp?: string;
  errors?: { field?: string; message?: string }[];
  /** `TERMS_ACCEPTANCE_REQUIRED` (428): the document versions still to accept. */
  requiredConsents?: { documentType?: string; version?: string }[];
  /** `ACCOUNT_SUSPENDED` (403): end of a temporary suspension, when known. */
  suspendedUntil?: string;
  /** `RATE_LIMITED` (429). */
  retryAfterSeconds?: number;
  /** `DELETION_BLOCKED` (409): open obligations that prevent the account deletion. */
  blockers?: string[];
}

export interface ApiErrorShape {
  errorCode: string;
  message: string;
  requestId: string | null;
  status: number;
  fieldErrors: Record<string, string>;
}

/** Error code used when the request never reached the server (offline, CORS, DNS, timeout). */
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';

/**
 * Normalised API error thrown by the HTTP error interceptor.
 * Components can rely on these fields regardless of what the server sent.
 */
export class ApiError extends Error implements ApiErrorShape {
  readonly errorCode: string;
  readonly requestId: string | null;
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  /** The raw Problem Details body (extensions such as `requiredConsents`, `suspendedUntil`). */
  readonly problem: ProblemDetailBody | null;

  constructor(shape: ApiErrorShape, options?: { cause?: unknown; problem?: ProblemDetailBody }) {
    super(shape.message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.errorCode = shape.errorCode;
    this.requestId = shape.requestId;
    this.status = shape.status;
    this.fieldErrors = shape.fieldErrors;
    this.problem = options?.problem ?? null;
  }

  /** True when the request never reached the server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** True for HTTP 5xx responses. */
  get isServerError(): boolean {
    return this.status >= 500 && this.status <= 599;
  }

  toJSON(): ApiErrorShape {
    const { errorCode, message, requestId, status, fieldErrors } = this;
    return { errorCode, message, requestId, status, fieldErrors };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function isProblemDetail(value: unknown): value is ProblemDetailBody {
  return !!value && typeof value === 'object' && !(value instanceof Blob);
}

/** Converts an `HttpErrorResponse` (or anything else thrown) into an {@link ApiError}. */
export function toApiError(error: unknown, fallbackRequestId: string | null = null): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    const status = error.status;
    const body: ProblemDetailBody = isProblemDetail(error.error) ? error.error : {};
    const fieldErrors: Record<string, string> = {};
    for (const entry of body.errors ?? []) {
      if (entry.field) {
        fieldErrors[entry.field] = entry.message ?? 'Invalid value';
      }
    }
    const requestId = body.requestId ?? error.headers?.get('X-Request-Id') ?? fallbackRequestId;
    const message =
      body.message ??
      body.detail ??
      body.title ??
      (status === 0 ? 'The OrenjiTrade API could not be reached.' : `Request failed (${status}).`);
    return new ApiError(
      {
        errorCode: body.errorCode ?? (status === 0 ? NETWORK_ERROR_CODE : UNKNOWN_ERROR_CODE),
        message,
        requestId,
        status: body.status ?? status,
        fieldErrors,
      },
      { cause: error, problem: isProblemDetail(error.error) ? body : undefined },
    );
  }

  return new ApiError(
    {
      errorCode: UNKNOWN_ERROR_CODE,
      message: error instanceof Error ? error.message : 'Unexpected error.',
      requestId: fallbackRequestId,
      status: 0,
      fieldErrors: {},
    },
    { cause: error },
  );
}
