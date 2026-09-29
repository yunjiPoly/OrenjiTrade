import type {
  ApiError as SharedApiError,
  ProblemDetail,
  RequiredConsent,
} from '@orenji/shared-types';

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';

/** Error codes from `docs/api/README.md` the app reacts to specifically. */
export const TERMS_ACCEPTANCE_REQUIRED_CODE = 'TERMS_ACCEPTANCE_REQUIRED';
export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';
export const REAUTHENTICATION_REQUIRED_CODE = 'REAUTHENTICATION_REQUIRED';

type DocumentType = RequiredConsent['documentType'];

function isRequiredConsent(value: {
  documentType?: string;
  version?: string;
}): value is RequiredConsent {
  return typeof value.documentType === 'string' && typeof value.version === 'string';
}

/**
 * Error thrown by the API client for every non-2xx response and for transport failures.
 * Structurally compatible with the `ApiError` shape in `@orenji/shared-types` so UI code can be
 * shared with the web client's error handling.
 */
export class ApiError extends Error implements SharedApiError {
  readonly name = 'ApiError';
  readonly status: number;
  readonly errorCode: string;
  readonly requestId: string | null;
  readonly fieldErrors: Record<string, string>;
  /** The raw RFC 9457 body when the server sent one. */
  readonly problem: ProblemDetail | null;

  constructor(init: {
    status: number;
    errorCode: string;
    message: string;
    requestId?: string | null;
    fieldErrors?: Record<string, string>;
    problem?: ProblemDetail | null;
    cause?: unknown;
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.status = init.status;
    this.errorCode = init.errorCode;
    this.requestId = init.requestId ?? null;
    this.fieldErrors = init.fieldErrors ?? {};
    this.problem = init.problem ?? null;
  }

  /** True for offline / DNS / timeout failures where no HTTP response was received. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** `428 TERMS_ACCEPTANCE_REQUIRED`: the user must accept `requiredConsents` first. */
  get isConsentRequired(): boolean {
    return this.status === 428 || this.errorCode === TERMS_ACCEPTANCE_REQUIRED_CODE;
  }

  /** `403 ACCOUNT_SUSPENDED` (also sent for DELETION_REQUESTED accounts). */
  get isSuspended(): boolean {
    return this.status === 403 && this.errorCode === ACCOUNT_SUSPENDED_CODE;
  }

  /** `401 REAUTHENTICATION_REQUIRED`: the ID token's `auth_time` is too old for this action. */
  get isReauthenticationRequired(): boolean {
    return this.status === 401 && this.errorCode === REAUTHENTICATION_REQUIRED_CODE;
  }

  /** Documents to accept, from the `requiredConsents` extension of a 428 problem. */
  get requiredConsents(): RequiredConsent[] {
    return (this.problem?.requiredConsents ?? []).filter(isRequiredConsent).map((entry) => ({
      documentType: entry.documentType as DocumentType,
      version: entry.version,
    }));
  }

  /** End of a temporary suspension, from the `suspendedUntil` extension of a 403 problem. */
  get suspendedUntil(): string | null {
    return this.problem?.suspendedUntil ?? null;
  }

  /** Builds an `ApiError` from a failed response body (RFC 9457 Problem Details or anything else). */
  static fromProblem(
    status: number,
    body: unknown,
    fallbackRequestId: string | null = null
  ): ApiError {
    const problem = (body !== null && typeof body === 'object' ? body : {}) as ProblemDetail;
    const fieldErrors: Record<string, string> = {};
    for (const entry of problem.errors ?? []) {
      if (entry.field) {
        fieldErrors[entry.field] = entry.message ?? 'Invalid value';
      }
    }
    return new ApiError({
      status: problem.status ?? status,
      errorCode: problem.errorCode ?? UNKNOWN_ERROR_CODE,
      message: problem.message ?? problem.detail ?? problem.title ?? `Request failed (${status})`,
      requestId: problem.requestId ?? fallbackRequestId,
      fieldErrors,
      problem: Object.keys(problem).length > 0 ? problem : null,
    });
  }

  static network(cause: unknown, requestId: string | null = null): ApiError {
    return new ApiError({
      status: 0,
      errorCode: NETWORK_ERROR_CODE,
      message: 'Could not reach OrenjiTrade. Check your connection and try again.',
      requestId,
      cause,
    });
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
