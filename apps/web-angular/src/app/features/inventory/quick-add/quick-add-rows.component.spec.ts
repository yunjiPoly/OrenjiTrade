import { LiveAnnouncer } from '@angular/cdk/a11y';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardSuggestion, CatalogService } from '@orenji/api-client';
import { Observable, Subject, of } from 'rxjs';
import { InventoryStore } from '../data/inventory.store';
import { item } from '../testing/fixtures';
import { QuickAddRowsComponent, chosenMatchesText } from './quick-add-rows.component';

const PRINTING: CardSuggestion = {
  kind: 'PRINTING' as CardSuggestion['kind'],
  id: 'c1',
  printingId: 'p12',
  name: 'Halo Seraph Guardian',
  game: 'yugioh',
  printingCode: 'GLM-EN012',
  setName: 'Gleaming',
  rarity: 'Rare',
};

describe('QuickAddRowsComponent (spec 9.10, Shift+N)', () => {
  let fixture: ComponentFixture<QuickAddRowsComponent>;
  let element: HTMLElement;
  let suggest: ReturnType<typeof vi.fn>;
  let createItem: ReturnType<typeof vi.fn>;
  let announce: ReturnType<typeof vi.fn>;
  let answers: Subject<CardSuggestion[]>[];

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answers = [];
    // Each suggest answers only when the test says so (a slow network).
    suggest = vi.fn((): Observable<CardSuggestion[]> => {
      const answer = new Subject<CardSuggestion[]>();
      answers.push(answer);
      return answer;
    });
    createItem = vi.fn(() =>
      Promise.resolve(item('new', { card: { id: 'c1', name: PRINTING.name!, game: 'yugioh' } })),
    );
    announce = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogService,
          useValue: { suggestCards: suggest, getCard: vi.fn(() => of({})) },
        },
        {
          provide: InventoryStore,
          useValue: {
            binders: signal([]),
            bindersById: signal(new Map()),
            createItem,
            deleteItem: vi.fn(() => Promise.resolve()),
          },
        },
        { provide: LiveAnnouncer, useValue: { announce } },
      ],
    });
    fixture = TestBed.createComponent(QuickAddRowsComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  function field(): HTMLInputElement {
    return element.querySelector<HTMLInputElement>('[data-testid="quick-code"]')!;
  }

  async function type(text: string): Promise<void> {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function enter(): Promise<void> {
    element
      .querySelector('[data-testid="quick-entry"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.advanceTimersByTimeAsync(10);
    await fixture.whenStable();
  }

  it('drops a suggestion that answers after the row was added, so Enter adds nothing more (F5)', async () => {
    await type('GLM-EN012');
    // Enter within the 250 ms debounce: the code is resolved on its own (answers[0])...
    element
      .querySelector('[data-testid="quick-entry"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // ...while the debounced suggest of the same text goes out too (answers[1]).
    await vi.advanceTimersByTimeAsync(300);
    expect(answers.length).toBe(2);
    answers[0].next([PRINTING]);
    answers[0].complete();
    await vi.advanceTimersByTimeAsync(10);
    await fixture.whenStable();
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('');

    // The debounced answer arrives after the row was added: nothing is chosen again.
    answers[1].next([PRINTING]);
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="quick-printing"]')!.textContent).toContain(
      'Pick from the list',
    );

    await enter();
    expect(createItem).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="quick-error"]')!.textContent).toContain(
      'Type a code or a name first.',
    );
  });

  it('after a row, copies go back to 1 and the printing is cleared; the row is announced (M12, M20)', async () => {
    await type('GLM-EN012');
    await vi.advanceTimersByTimeAsync(300);
    answers[0].next([PRINTING]);
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="quick-printing"]')!.textContent).toContain(
      'GLM-EN012',
    );
    element.querySelector<HTMLButtonElement>('button[aria-label="One more"]')!.click();
    element.querySelector<HTMLButtonElement>('button[aria-label="One more"]')!.click();
    await fixture.whenStable();
    expect(element.querySelector<HTMLInputElement>('input[aria-label="Copies"]')!.value).toBe('3');

    await enter();
    expect(createItem).toHaveBeenCalledWith(
      expect.objectContaining({ printingId: 'p12', quantity: 3 }),
      { explainLimit: true },
    );
    expect(element.querySelector<HTMLInputElement>('input[aria-label="Copies"]')!.value).toBe('1');
    expect(element.querySelector('[data-testid="quick-printing"]')!.textContent).toContain(
      'Pick from the list',
    );
    expect(announce).toHaveBeenCalledWith('Added Halo Seraph Guardian', 'polite');
  });

  it('a printing counts only while the field still names it', () => {
    expect(chosenMatchesText(PRINTING, 'glm-en012')).toBe(true);
    expect(chosenMatchesText(PRINTING, '')).toBe(false);
    expect(chosenMatchesText(PRINTING, 'GLM-EN013')).toBe(false);
    expect(chosenMatchesText(null, 'GLM-EN012')).toBe(false);
  });

  it('tells apart two printings of one code by their edition (U2)', async () => {
    await type('lantern');
    await vi.advanceTimersByTimeAsync(300);
    const twin = (printingId: string, edition: string): CardSuggestion => ({
      ...PRINTING,
      printingId,
      printingCode: 'AZR-EN011',
      name: 'Lantern Fox Spirit',
      rarity: 'Secret Rare',
      edition,
    });
    answers[0].next([twin('a', 'FIRST_EDITION'), twin('b', 'UNLIMITED')]);
    await fixture.whenStable();
    const options = [...element.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options[0]).toContain('1st Edition');
    expect(options[1]).toContain('Unlimited');
  });
});
