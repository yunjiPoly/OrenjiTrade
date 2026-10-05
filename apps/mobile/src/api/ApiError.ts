import type { ApiError as SharedApiError } from '@orenji/shared-types';

import type { ProblemDetail, RequiredConsent } from './types';

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';
export const EMPTY_RESPONSE_CODE = 'EMPTY_RESPONSE';

/** Error codes (docs/api/README.md) the app reacts to specifically. */
export const TERMS_ACCEPTANCE_REQUIRED_CODE = 'TERMS_ACCEPTANCE_REQUIRED';
export const ACCOUNT_SUSPENDED_CODE = 'ACCOUNT_SUSPENDED';
export const REAUTHENTICATION_REQUIRED_CODE = 'REAUTHENTICATION_REQUIRED';
/** Message of the 403 `ACCOUNT_SUSPENDED` answered while an account deletion is pending. */
export const DELETION_PENDING_MESSAGE = 'deletion pending';

/**
 * The RFC 9457 body as the API sends it, every field optional (a proxy or an older server may
 * send less) and `errorCode` a plain string so codes added by a newer server still flow through.
 * Extensions: `requiredConsents` (428), `suspendedUntil` (403), `retryAfterSeconds` (429),
 * `blockers` (409 DELETION_BLOCKED), ...
 */
export type ProblemBody = Partial<Omit<ProblemDetail, 'errorCode'>> & { errorCode?: string };

type DocumentType = RequiredConsent['documentType'];

/**
 * Error thrown by the API client for every non-2xx response and for transport failures.
 * Structurally compatible with the shared `ApiError` shape (and with the web's `ApiError`).
 */
export class ApiError extends Error implements SharedApiError {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly errorCode: string;
  readonly requestId: string | null;
  readonly fieldErrors: Record<string, string>;
  /** The raw Problem Details body when the server sent one. */
  readonly problem: ProblemBody | null;

  constructor(init: {
    status: number;
    errorCode: string;
    message: string;
    requestId?: string | null;
    fieldErrors?: Record<string, string>;
    problem?: ProblemBody | null;
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
    return this.status === 0 && this.errorCode === NETWORK_ERROR_CODE;
  }

  get isServerError(): boolean {
    return this.status >= 500 && this.status <= 599;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** `428 TERMS_ACCEPTANCE_REQUIRED`: the user must accept `requiredConsents` first. */
  get isConsentRequired(): boolean {
    return this.errorCode === TERMS_ACCEPTANCE_REQUIRED_CODE;
  }

  /** `403 ACCOUNT_SUSPENDED`: suspended, deleted, or (see {@link isDeletionPending}) leaving. */
  get isAccountSuspended(): boolean {
    return this.errorCode === ACCOUNT_SUSPENDED_CODE;
  }

  /** `403 ACCOUNT_SUSPENDED "deletion pending"`: the owner asked for the account's deletion. */
  get isDeletionPending(): boolean {
    return this.isAccountSuspended && this.message === DELETION_PENDING_MESSAGE;
  }

  /** `401 REAUTHENTICATION_REQUIRED`: the ID token's `auth_time` is too old for this action. */
  get isReauthenticationRequired(): boolean {
    return this.errorCode === REAUTHENTICATION_REQUIRED_CODE;
  }

  /** Documents to accept, from the `requiredConsents` extension of a 428 problem. */
  get requiredConsents(): RequiredConsent[] {
    return (this.problem?.requiredConsents ?? [])
      .filter(
        (entry): entry is { documentType: string; version: string } =>
          typeof entry.documentType === 'string' && typeof entry.version === 'string'
      )
      .map((entry) => ({
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
    const isProblem = body !== null && typeof body === 'object';
    const problem = (isProblem ? body : {}) as ProblemBody;
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
      problem: isProblem && Object.keys(problem).length > 0 ? problem : null,
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

  /** A 2xx answer without the body the contract promises (never expected in practice). */
  static emptyResponse(): ApiError {
    return new ApiError({
      status: 0,
      errorCode: EMPTY_RESPONSE_CODE,
      message: 'The server sent an empty answer.',
    });
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
