import { act, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';

import {
  useBulkImport,
  useCommitImport,
  useImportEditsPending,
  useUpdateImportRow,
} from '@/src/api/hooks/inventoryImport';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { IMPORT_ID, importFixture, rowFixture } from '../support/importFixtures';
import { mockApi, ok, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { renderWithProviders, resetAppState } from '../test-utils';

const IMPORTS = '/api/v1/inventory/imports';

interface Hooks {
  row: ReturnType<typeof useUpdateImportRow>;
  bulk: ReturnType<typeof useBulkImport>;
  commit: ReturnType<typeof useCommitImport>;
  pending: number;
}

/** The hooks of one preview, as a screen holds them. */
function Probe({ onHooks }: { onHooks: (hooks: Hooks) => void }) {
  const row = useUpdateImportRow(IMPORT_ID);
  const bulk = useBulkImport(IMPORT_ID);
  const commit = useCommitImport(IMPORT_ID);
  const pending = useImportEditsPending(IMPORT_ID);
  useEffect(() => {
    onHooks({ row, bulk, commit, pending });
  });
  return null;
}

beforeEach(() => resetAppState());

describe('the commit of an import and the edits made before it', () => {
  it('is sent after every edit that was made before it, however slow their answers are', async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const committed = importFixture({ status: 'COMMITTED' });
    const api = mockApi(
      signedInRoutes({
        [`PATCH ${IMPORTS}/{id}/rows/{rowId}`]: async ({ body }: MockRequest) => {
          order.push(`edit received ${JSON.stringify(body)}`);
          await slow;
          order.push('edit answered');
          return ok({ row: rowFixture({ included: false }), preview: importFixture() });
        },
        [`POST ${IMPORTS}/{id}/bulk`]: async () => {
          order.push('bulk received');
          return ok({ updated: 0, undecided: 0, preview: importFixture() });
        },
        [`POST ${IMPORTS}/{id}/commit`]: () => {
          order.push('commit received');
          return ok(committed);
        },
        [`GET ${IMPORTS}/{id}/rows`]: ok({ items: [], page: 0, size: 50, totalItems: 0 }),
      })
    );
    let hooks = null as Hooks | null;
    renderWithProviders(<Probe onHooks={(next) => (hooks = next)} />, {
      port: new FakeAuthPort(testUser()),
    });
    await waitFor(() => expect(hooks).not.toBeNull());

    // The collector leaves a card out, takes a bulk action and presses the commit, in that order,
    // before the first answer is back.
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      void hooks!.row.mutateAsync({ row: rowFixture(), patch: { included: false } });
      void hooks!.bulk.mutateAsync({ action: 'USE_MOST_RECENT_PRINTING' });
      done = hooks!.commit.mutateAsync({ skipUnresolved: false });
    });
    await waitFor(() => expect(order).toEqual(['edit received {"included":false}']));
    // Two edits are on their way or wait their turn; the commit is not one of them.
    await waitFor(() => expect(hooks!.pending).toBe(2));
    expect(api.callsTo(`POST ${IMPORTS}/{id}/commit`)).toHaveLength(0);
    expect(api.callsTo(`POST ${IMPORTS}/{id}/bulk`)).toHaveLength(0);

    await act(async () => {
      release();
      await done;
    });
    expect(order).toEqual([
      'edit received {"included":false}',
      'edit answered',
      'bulk received',
      'commit received',
    ]);
    await waitFor(() => expect(hooks!.pending).toBe(0));
  });

  it('counts no edit while nothing is being saved', async () => {
    mockApi(signedInRoutes({}));
    let hooks = null as Hooks | null;
    renderWithProviders(<Probe onHooks={(next) => (hooks = next)} />, {
      port: new FakeAuthPort(testUser()),
    });
    await waitFor(() => expect(hooks).not.toBeNull());
    expect(hooks!.pending).toBe(0);
  });
});
