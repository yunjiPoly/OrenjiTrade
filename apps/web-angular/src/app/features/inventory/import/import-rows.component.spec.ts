import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InventoryImportResponse, InventoryImportRow } from '@orenji/api-client';
import { importPreview, importRow } from '../testing/fixtures';
import { ImportRowsComponent } from './import-rows.component';

const DECK = importPreview({
  source: 'YDK' as InventoryImportResponse['source'],
  sections: {
    includeMain: true,
    includeExtra: true,
    includeSide: true,
    mainCopies: 1,
    extraCopies: 0,
    sideCopies: 0,
  },
});

describe('ImportRowsComponent (spec 9.11, R2-1: a box always shows what its row holds)', () => {
  let fixture: ComponentFixture<ImportRowsComponent>;
  let element: HTMLElement;
  let toggled: { row: InventoryImportRow; included: boolean }[];
  let sections: { key: string; include: boolean }[];

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(ImportRowsComponent);
    fixture.componentRef.setInput('preview', importPreview());
    fixture.componentRef.setInput('rows', [importRow('r1', 0), importRow('r2', 1)]);
    toggled = [];
    sections = [];
    fixture.componentInstance.include.subscribe((event) => toggled.push(event));
    fixture.componentInstance.includeSection.subscribe((event) => sections.push(event));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  function box(name: string): HTMLInputElement {
    return element.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
  }

  it('holds a row box clicked while the check works (Use the newest, a section, a reload)', async () => {
    fixture.componentRef.setInput('working', true);
    await fixture.whenStable();
    const knight = box('Include Fixture card r1');
    expect(knight.getAttribute('aria-disabled')).toBe('true');

    knight.click();
    await fixture.whenStable();

    expect(knight.checked).toBe(true);
    expect(toggled).toEqual([]);
    // The other controls of the row hold too: the copies and the printing.
    expect(
      element
        .querySelector('[aria-label="One more Fixture card r1"]')!
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      element
        .querySelector('[aria-label^="Choose a printing of Fixture card r1"]')!
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('takes the toggle again once the check is done', async () => {
    fixture.componentRef.setInput('working', true);
    await fixture.whenStable();
    fixture.componentRef.setInput('working', false);
    await fixture.whenStable();
    const knight = box('Include Fixture card r1');
    expect(knight.hasAttribute('aria-disabled')).toBe(false);

    knight.click();
    await fixture.whenStable();

    expect(toggled.map((event) => [event.row.id, event.included])).toEqual([['r1', false]]);
  });

  it('puts back a toggle the page refused: the box never ends unchecked over an included row', async () => {
    // The page took nothing (no save started, the row unchanged).
    const knight = box('Include Fixture card r1');
    knight.click();
    expect(knight.checked).toBe(false);
    await fixture.whenStable();

    expect(toggled).toHaveLength(1);
    expect(knight.checked).toBe(true);
  });

  it('keeps the collector’s toggle while the row saves, then shows what the server answered', async () => {
    const knight = box('Include Fixture card r1');
    knight.click();
    fixture.componentRef.setInput('busyRows', new Set(['r1']));
    await fixture.whenStable();
    expect(knight.checked).toBe(false);
    expect(knight.getAttribute('aria-disabled')).toBe('true');

    // Saved: the row is left out.
    fixture.componentRef.setInput('rows', [
      importRow('r1', 0, { included: false, willImport: false }),
      importRow('r2', 1),
    ]);
    fixture.componentRef.setInput('busyRows', new Set());
    await fixture.whenStable();

    expect(knight.checked).toBe(false);
    expect(element.querySelector('[data-testid="import-row-0"]')!.textContent).toContain(
      'Left out',
    );
  });

  it('leaves the box matching the row when its save fails', async () => {
    const knight = box('Include Fixture card r1');
    knight.click();
    fixture.componentRef.setInput('busyRows', new Set(['r1']));
    await fixture.whenStable();
    expect(knight.checked).toBe(false);

    // Failed: the row is unchanged (still included).
    fixture.componentRef.setInput('busyRows', new Set());
    await fixture.whenStable();

    expect(knight.checked).toBe(true);
  });

  it('a row put back in, refused, stays unchecked like its left-out row', async () => {
    fixture.componentRef.setInput('rows', [
      importRow('r1', 0, { included: false, willImport: false }),
      importRow('r2', 1),
    ]);
    await fixture.whenStable();
    const knight = box('Include Fixture card r1');
    expect(knight.checked).toBe(false);

    knight.click();
    await fixture.whenStable();

    expect(toggled.map((event) => event.included)).toEqual([true]);
    expect(knight.checked).toBe(false);
  });

  describe('a deck file’s section box', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('preview', DECK);
      fixture.componentRef.setInput('rows', [
        importRow('r1', 0, { deck: { main: 1, extra: 0, side: 0 } }),
      ]);
      await fixture.whenStable();
    });

    it('holds while the check works', async () => {
      fixture.componentRef.setInput('working', true);
      await fixture.whenStable();
      const main = box('Include the Main deck');
      main.click();
      await fixture.whenStable();
      expect(main.checked).toBe(true);
      expect(sections).toEqual([]);
    });

    it('goes back to what the section holds when its save fails', async () => {
      const main = box('Include the Main deck');
      main.click();
      expect(sections).toEqual([{ key: 'main', include: false }]);
      // The page saves (the check works), then fails: the preview is unchanged.
      fixture.componentRef.setInput('working', true);
      await fixture.whenStable();
      expect(main.checked).toBe(false);
      fixture.componentRef.setInput('working', false);
      await fixture.whenStable();

      expect(main.checked).toBe(true);
    });

    it('shows the saved section once the check is done', async () => {
      const main = box('Include the Main deck');
      main.click();
      fixture.componentRef.setInput('working', true);
      await fixture.whenStable();
      fixture.componentRef.setInput(
        'preview',
        importPreview({ ...DECK, sections: { ...DECK.sections!, includeMain: false } }),
      );
      fixture.componentRef.setInput('working', false);
      await fixture.whenStable();

      expect(main.checked).toBe(false);
    });
  });
});
