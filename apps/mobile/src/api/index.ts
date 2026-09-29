export {
  ACCOUNT_SUSPENDED_CODE,
  ApiError,
  NETWORK_ERROR_CODE,
  REAUTHENTICATION_REQUIRED_CODE,
  TERMS_ACCEPTANCE_REQUIRED_CODE,
  UNKNOWN_ERROR_CODE,
  isApiError,
} from './ApiError';
export {
  clearAccountSignal,
  reportAccountSignal,
  signalFromApiError,
  useAccountSignalStore,
  type AccountSignal,
  type AccountSignalStore,
} from './accountState';
export {
  API_BASE_URL,
  DEFAULT_API_BASE_URL,
  REQUEST_ID_HEADER,
  api,
  apiMiddleware,
  createApiClient,
  resolveApiBaseUrl,
  type ApiClient,
  type CreateApiClientOptions,
} from './client';
export { acceptConsents, useAcceptConsents } from './mutations/useAcceptConsents';
export { LEGAL_DOCUMENTS_QUERY_KEY, ME_QUERY_KEY, meQueryKey } from './queries/keys';
export { connectQueryManagers, createQueryClient, queryClient } from './queryClient';
export {
  fetchLegalDocuments,
  requiredAtRegistration,
  useLegalDocuments,
  type UseLegalDocumentsOptions,
} from './queries/useLegalDocuments';
export {
  deriveAccountState,
  fetchMe,
  useMe,
  type AccountSnapshot,
  type AccountState,
  type DeriveAccountStateInput,
  type UseMeOptions,
  type UseMeResult,
} from './queries/useMe';
export { fetchMeta, metaQueryKey, useMeta } from './queries/useMeta';
