import type { ReactNode } from 'react';
import { View } from 'react-native';

import { EmptyState, type EmptyStateProps } from './EmptyState';
import { ErrorState } from './ErrorState';
import { SkeletonList } from './Skeleton';

/** The part of a TanStack query result `QueryState` reads. */
export interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isFetching?: boolean;
  refetch: () => unknown;
}

export interface QueryStateProps<T> {
  query: QueryLike<T>;
  /** Shown while the first answer is pending (default: a skeleton list). */
  loading?: ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
  /** When it returns true the empty state is shown instead of `children`. */
  isEmpty?: (data: T) => boolean;
  empty?: EmptyStateProps;
  children: (data: T) => ReactNode;
  testID?: string;
}

/**
 * The loading / error-with-retry / empty / content switch every data screen needs (CLAUDE.md).
 * Offline tolerance: cached data keeps rendering when a background refresh fails; the error
 * state only appears when there is nothing to show (the OfflineBanner tells the rest).
 */
export function QueryState<T>({
  query,
  loading,
  loadingLabel = 'Loading',
  errorTitle = 'We could not load this',
  isEmpty,
  empty,
  children,
  testID = 'query-state',
}: QueryStateProps<T>) {
  if (query.data !== undefined) {
    if (isEmpty?.(query.data) && empty) {
      return <EmptyState testID={`${testID}-empty`} {...empty} />;
    }
    return <>{children(query.data)}</>;
  }
  if (query.error) {
    return (
      <ErrorState
        testID={`${testID}-error`}
        error={query.error}
        title={errorTitle}
        onRetry={() => void query.refetch()}
        retryLabel={query.isFetching ? 'Retrying…' : 'Try again'}
      />
    );
  }
  return (
    <View accessibilityLabel={loadingLabel} aria-busy testID={`${testID}-loading`}>
      {loading ?? <SkeletonList rows={3} />}
    </View>
  );
}
