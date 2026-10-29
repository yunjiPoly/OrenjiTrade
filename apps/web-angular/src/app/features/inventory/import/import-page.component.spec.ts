import { LiveAnnouncer } from '@angular/cdk/a11y';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CatalogService,
  InventoryImportRow,
  InventoryImportService,
  PageResponseInventoryImportRow,
} from '@orenji/api-client';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { importPreview, importRow } from '../testing/fixtures';
import { ImportPageComponent } from './import-page.component';

/** A Collectr export of two lines: the Knight ready, the Dragon still to choose. */
const OPEN = importPreview({
  summary: { ...importPreview().summary, ready: 1, toChoose: 1, items: 1 },
});
const KNIGHT = importRow('knight', 1, {
  source: { name: 'Mirrorblade Knight' },
  card: { id: 'c-knight', name: 'Mirrorblade Knight', game: 'yugioh' },
});
const DRAGON = importRow('dragon', 0, {
  status: 'CHOOSE_PRINTING' as InventoryImportRow['status'],
  source: { name: 'Azure-Eyes Sky Dragon' },
  card: { id: 'c-dragon', name: 'Azure-Eyes Sky Dragon', game: 'yugioh' },
});

function page(items: InventoryImportRow[]): PageResponseInventoryImportRow {
  return { items, page: 0, size: 100, totalItems: items.length, totalPages: 1 };
}

describe('ImportPageComponent (spec 9.11, R2-1: no row edit is lost while the check works)', () => {
  let fixture: ComponentFixture<ImportPageComponent>;
  let element: HTMLElement;
  let rowsAnswers: Subject<PageResponseInventoryImportRow>[];
  let slowRows: boolean;
  let updateRow: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    rowsAnswers = [];
    slowRows = false;
    updateRow = vi.fn(
      (args: {
        rowId: string;
        updateInventoryImportRowRequest: { included?: boolean; quantity?: number };
      }) => {
        const patch = args.updateInventoryImportRowRequest;
        return of({
          row: { ...KNIGHT, ...patch, willImport: patch.included ?? true },
          preview: OPEN,
        });
      },
    );
    const api = {
      getInventoryImportLimits: vi.fn(() =>
        of({
          ydkMaxBytes: 100_000,
          ydkMaxLines: 500,
          csvMaxBytes: 2_000_000,
          csvMaxRows: 5000,
          previewTtlMinutes: 60,
        }),
      ),
      listInventoryImports: vi.fn(() => of([OPEN])),
      // The rows list: at once, or (slowRows) only when the test answers (a slow network).
      listInventoryImportRows: vi.fn((): Observable<PageResponseInventoryImportRow> => {
        if (!slowRows) {
          return of(page([DRAGON, KNIGHT]));
        }
        const answer = new Subject<PageResponseInventoryImportRow>();
        rowsAnswers.push(answer);
        return answer;
      }),
      bulkUpdateInventoryImport: vi.fn(() =>
        of({
          updated: 1,
          assumed: 0,
          undecided: 0,
          preview: { ...OPEN, summary: { ...OPEN.summary, ready: 2, toChoose: 0, items: 2 } },
        }),
      ),
      updateInventoryImportRow: updateRow,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: InventoryImportService, useValue: api },
        { provide: CatalogService, useValue: { listGames: vi.fn(() => of([])), getCard: vi.fn() } },
        {
          provide: AuthService,
          useValue: { ready: () => Promise.resolve(), isAuthenticated: signal(true) },
        },
        { provide: LiveAnnouncer, useValue: { announce: vi.fn(() => Promise.resolve()) } },
      ],
    });
    fixture = TestBed.createComponent(ImportPageComponent);
    element = fixture.nativeElement as HTMLElement;
    await settle();
    expect(knightBox()).toBeTruthy();
  });

  async function settle(): Promise<void> {
    for (let pass = 0; pass < 4; pass++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  function knightBox(): HTMLInputElement {
    return element.querySelector<HTMLInputElement>(
      'input[aria-label="Include Mirrorblade Knight"]',
    )!;
  }

  function sentIncluded(): unknown[] {
    return updateRow.mock.calls
      .map(([args]) => args as { updateInventoryImportRowRequest: object })
      .map((args) => args.updateInventoryImportRowRequest);
  }

  async function useTheNewestSlowly(): Promise<void> {
    slowRows = true;
    element.querySelector<HTMLButtonElement>('[data-testid="import-newest"]')!.click();
    await settle();
    // The bar left (the preview has no card to choose), the rows still reload.
    expect(element.querySelector('[data-testid="import-choose-bar"]')).toBeNull();
    expect(rowsAnswers).toHaveLength(1);
  }

  it('holds a row unchecked while Use the newest reloads the rows, then takes it', async () => {
    await useTheNewestSlowly();
    const box = knightBox();
    expect(box.getAttribute('aria-disabled')).toBe('true');

    box.click();
    await settle();

    // Nothing is sent, and the box does not claim the row is left out.
    expect(updateRow).not.toHaveBeenCalled();
    expect(knightBox().checked).toBe(true);

    rowsAnswers[0].next(
      page([{ ...DRAGON, status: 'READY' as InventoryImportRow['status'] }, KNIGHT]),
    );
    rowsAnswers[0].complete();
    await settle();
    expect(knightBox().hasAttribute('aria-disabled')).toBe(false);

    knightBox().click();
    await settle();

    expect(sentIncluded()).toEqual([{ included: false }]);
    expect(knightBox().checked).toBe(false);
    expect(element.querySelector('[data-testid="import-row-1"]')!.textContent).toContain(
      'Left out',
    );
  });

  it('sends no copies step and no printing while the rows reload', async () => {
    await useTheNewestSlowly();
    const more = element.querySelector<HTMLButtonElement>(
      '[aria-label="One more Mirrorblade Knight"]',
    )!;
    expect(more.getAttribute('aria-disabled')).toBe('true');
    more.click();
    await settle();

    expect(updateRow).not.toHaveBeenCalled();
    expect(more.closest('.stepper')!.textContent).toContain('1');
    // The printing menu does not open while the row holds.
    const printing = element.querySelector<HTMLButtonElement>(
      '[aria-label^="Choose a printing of Mirrorblade Knight"]',
    )!;
    expect(printing.getAttribute('aria-disabled')).toBe('true');
    printing.click();
    await settle();
    expect(document.querySelector('.import-print-menu')).toBeNull();
  });

  it('leaves the box matching the row when the save fails', async () => {
    updateRow.mockImplementation(() =>
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );

    knightBox().click();
    await settle();

    expect(sentIncluded()).toEqual([{ included: false }]);
    expect(knightBox().checked).toBe(true);
    expect(element.querySelector('[data-testid="import-row-1"]')!.textContent).toContain('Ready');
  });

  it('keeps a saved left-out row unchecked (the server answered)', async () => {
    knightBox().click();
    await settle();

    expect(sentIncluded()).toEqual([{ included: false }]);
    expect(knightBox().checked).toBe(false);
  });

  it('holds a row while a filter reloads the rows (a stale list would undo the edit)', async () => {
    slowRows = true;
    element.querySelector<HTMLButtonElement>('.chips .chip')!.click();
    await settle();
    expect(rowsAnswers).toHaveLength(1);

    knightBox().click();
    await settle();

    expect(updateRow).not.toHaveBeenCalled();
    expect(knightBox().checked).toBe(true);
    rowsAnswers[0].next(page([DRAGON, KNIGHT]));
    rowsAnswers[0].complete();
    await settle();
    expect(knightBox().hasAttribute('aria-disabled')).toBe(false);
  });
});
