import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  BulkImportRequest,
  ImportBulkResponse,
  ImportLimits,
  ImportRow,
  ImportRowChange,
  ImportRowPage,
  ImportSource,
  InventoryImport,
  UpdateImportRequest,
  UpdateImportRowRequest,
} from '../types';
import { nextPage } from './catalog';
import { refreshInventory } from './inventory';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * The inventory import (stage S5, `docs/api/contracts/s5-inventory-import.md`): a YDK deck file or
 * a Collectr CSV export is uploaded, becomes a preview the API keeps for a short time, is edited
 * row by row and committed. Nothing reaches the inventory before the commit.
 *
 * The preview (`InventoryImport`: status, counts, deck sections, result) lives under one query;
 * every edit answers with the new preview and puts it there. The rows are paged lists per filter.
 */

/** Rows asked per page (the API takes 1 to 100). */
export const IMPORT_ROW_PAGE_SIZE = 50;

/** The rows a list shows: every row, the rows that need a printing, the rows that fit nothing. */
export type ImportRowFilter = 'ALL' | 'CHOOSE_PRINTING' | 'UNMATCHED';

type RowPages = InfiniteData<ImportRowPage, unknown>;

/** `GET /inventory/imports/limits`: what a file may be (admin settings), for a check before the upload. */
export function useImportLimits() {
  const uid = useUid();
  return useQuery<ImportLimits, ApiError>({
    queryKey: meKeys.importLimits(uid),
    queryFn: async () => required((await api.GET('/api/v1/inventory/imports/limits')).data),
    enabled: useIsAuthenticated(),
    staleTime: 5 * 60_000,
  });
}

/**
 * `GET /inventory/imports`: the caller's imports that are still of use, newest first (the open
 * preview, a commit that was cut, recent results). Read again every time the flow opens: it is
 * how an import started earlier, or on another device, is picked up.
 */
export function useMyImports() {
  const uid = useUid();
  return useQuery<InventoryImport[], ApiError>({
    queryKey: meKeys.importList(uid),
    queryFn: async () => required((await api.GET('/api/v1/inventory/imports')).data),
    enabled: useIsAuthenticated(),
    staleTime: 0,
    gcTime: 0,
  });
}

/** `GET /inventory/imports/{id}`: one import (404 for anyone else's, 410 once a preview expired). */
export function useInventoryImport(id: string | null) {
  const uid = useUid();
  return useQuery<InventoryImport, ApiError>({
    queryKey: meKeys.importOne(uid, id ?? ''),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/inventory/imports/{id}', { params: { path: { id: id ?? '' } } }))
          .data
      ),
    enabled: useIsAuthenticated() && !!id,
  });
}

/**
 * `GET /inventory/imports/{id}/rows`: the rows in file order, paged for an infinite list. The rows
 * only change through this app's own edits, which update or refresh these lists themselves: they
 * are not read again just because the app came back to the foreground (a long list is many pages).
 */
export function useImportRows(id: string | null, filter: ImportRowFilter) {
  const uid = useUid();
  return useInfiniteQuery<ImportRowPage, ApiError>({
    queryKey: meKeys.importRowList(uid, id ?? '', filter === 'ALL' ? null : filter),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/inventory/imports/{id}/rows', {
            params: {
              path: { id: id ?? '' },
              query: {
                status: filter === 'ALL' ? undefined : filter,
                page: pageParam as number,
                size: IMPORT_ROW_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => nextPage(last),
    enabled: useIsAuthenticated() && !!id,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function setPreview(queryClient: QueryClient, uid: string | null, preview: InventoryImport) {
  queryClient.setQueryData(meKeys.importOne(uid, preview.id), preview);
}

/** Puts a changed row in every cached list that holds it. */
function replaceRow(
  queryClient: QueryClient,
  uid: string | null,
  importId: string,
  row: ImportRow
) {
  queryClient.setQueriesData<RowPages>({ queryKey: meKeys.importRows(uid, importId) }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) =>
            page.items?.some((candidate) => candidate.id === row.id)
              ? {
                  ...page,
                  items: page.items.map((candidate) => (candidate.id === row.id ? row : candidate)),
                }
              : page
          ),
        }
      : data
  );
}

/**
 * The filtered lists are read again: a row that got its printing leaves "needs a printing", and
 * the pages after it move up by one (asking only for the next page would skip a row).
 */
async function refreshFilteredRows(queryClient: QueryClient, uid: string | null, importId: string) {
  await queryClient.invalidateQueries({
    queryKey: meKeys.importRows(uid, importId),
    predicate: (query) => query.queryKey[query.queryKey.length - 1] !== 'all',
  });
}

/**
 * Every list is read again from its first page: an action on the whole preview (a deck section,
 * a bulk action) may have changed any row. Only the first page is kept and asked again, so a long
 * list is not read page after page; scrolling loads the rest as before.
 */
async function refreshAllRows(queryClient: QueryClient, uid: string | null, importId: string) {
  queryClient.setQueriesData<RowPages>({ queryKey: meKeys.importRows(uid, importId) }, (data) =>
    data && data.pages.length > 1
      ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
      : data
  );
  await queryClient.invalidateQueries({ queryKey: meKeys.importRows(uid, importId) });
}

export interface UploadImportInput {
  source: ImportSource;
  /** CSV only: the game of rows that name none. */
  game?: string | null;
  /** The multipart body: one part `file` (`importFormData`). */
  body: FormData;
}

/**
 * `POST /inventory/imports?source=` (multipart `file`): the file becomes a preview. The API
 * decides what the file is from its content and refuses what it cannot import (413, 415, 400 with
 * a `reason`, 429 when rate limited). A new upload replaces the collector's open preview.
 */
export function useUploadImport() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryImport, ApiError, UploadImportInput>({
    mutationFn: async ({ source, game, body }) =>
      required(
        (
          await api.POST('/api/v1/inventory/imports', {
            params: { query: { source, ...(game ? { game } : {}) } },
            // The contract types the multipart body as `{ file: binary }`; the FormData is sent as is.
            body: body as unknown as { file: string },
            bodySerializer: () => body,
          })
        ).data
      ),
    onSuccess: (preview) => {
      // The preview this one replaced is gone on the server: nothing of it stays cached.
      queryClient.removeQueries({ queryKey: meKeys.imports(uid) });
      setPreview(queryClient, uid, preview);
    },
  });
}

/**
 * Edits of one preview run one after the other (`scope`): each answers with the counts after it,
 * and the last answer to arrive must be the last edit.
 */
function editScope(importId: string) {
  return { id: `inventory-import-${importId}` };
}

/** `PATCH /inventory/imports/{id}`: which sections of a deck count. */
export function useUpdateImportSections(importId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryImport, ApiError, UpdateImportRequest>({
    scope: editScope(importId),
    mutationFn: async (body) =>
      required(
        (
          await api.PATCH('/api/v1/inventory/imports/{id}', {
            params: { path: { id: importId } },
            body,
          })
        ).data
      ),
    onSuccess: async (preview) => {
      setPreview(queryClient, uid, preview);
      await refreshAllRows(queryClient, uid, importId);
    },
  });
}

export interface UpdateImportRowInput {
  row: ImportRow;
  patch: UpdateImportRowRequest;
}

/**
 * `PATCH /inventory/imports/{id}/rows/{rowId}`: the printing, the condition, the copies, in or
 * out. Leaving a row out or putting it back shows at once (and is put back if the API refuses).
 */
export function useUpdateImportRow(importId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ImportRowChange, ApiError, UpdateImportRowInput, { previous: ImportRow }>({
    scope: editScope(importId),
    mutationFn: async ({ row, patch }) =>
      required(
        (
          await api.PATCH('/api/v1/inventory/imports/{id}/rows/{rowId}', {
            params: { path: { id: importId, rowId: row.id } },
            body: patch,
          })
        ).data
      ),
    onMutate: ({ row, patch }) => {
      if (patch.included !== undefined && Object.keys(patch).length === 1) {
        replaceRow(queryClient, uid, importId, {
          ...row,
          included: patch.included,
          willImport: row.status === 'READY' && patch.included && row.inScope,
        });
      }
      return { previous: row };
    },
    onError: (_error, _input, context) => {
      if (context) {
        replaceRow(queryClient, uid, importId, context.previous);
      }
    },
    onSuccess: async ({ row, preview }, input) => {
      setPreview(queryClient, uid, preview);
      replaceRow(queryClient, uid, importId, row);
      if (row.status !== input.row.status) {
        await refreshFilteredRows(queryClient, uid, importId);
      }
    },
  });
}

/**
 * `POST /inventory/imports/{id}/bulk`: the most recent printing for every row without one, or one
 * condition for every row whose file names none.
 */
export function useBulkImport(importId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ImportBulkResponse, ApiError, BulkImportRequest>({
    scope: editScope(importId),
    mutationFn: async (body) =>
      required(
        (
          await api.POST('/api/v1/inventory/imports/{id}/bulk', {
            params: { path: { id: importId } },
            body,
          })
        ).data
      ),
    onSuccess: async ({ preview }) => {
      setPreview(queryClient, uid, preview);
      await refreshAllRows(queryClient, uid, importId);
    },
  });
}

/**
 * `POST /inventory/imports/{id}/commit`: the ready rows become inventory items. The API makes it
 * safe to send again: a second commit, or one repeated after a lost answer, adds nothing twice and
 * answers the same result; a commit that was cut continues where it stopped.
 */
export function useCommitImport(importId: string) {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<InventoryImport, ApiError, { skipUnresolved: boolean }>({
    mutationFn: async ({ skipUnresolved }) =>
      required(
        (
          await api.POST('/api/v1/inventory/imports/{id}/commit', {
            params: { path: { id: importId } },
            body: { skipUnresolved },
          })
        ).data
      ),
    onSuccess: async (done) => {
      setPreview(queryClient, uid, done);
      await refreshInventory(queryClient, uid);
    },
    // A cut commit may have written some chunks: the inventory is read again either way.
    onError: async () => refreshInventory(queryClient, uid),
  });
}

/** `DELETE /inventory/imports/{id}`: discards a preview no commit has started. */
export function useDiscardImport() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await api.DELETE('/api/v1/inventory/imports/{id}', { params: { path: { id } } });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: meKeys.imports(uid) });
    },
  });
}

/** The loaded rows of an infinite rows query, in file order. */
export function loadedRows(data: RowPages | undefined): ImportRow[] {
  return data?.pages.flatMap((page) => page.items ?? []) ?? [];
}
