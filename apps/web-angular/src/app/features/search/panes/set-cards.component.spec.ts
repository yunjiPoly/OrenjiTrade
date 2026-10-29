import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { SetCardsComponent, setChipLabel } from './set-cards.component';

/** A set page's "Who has cards of this set" (spec 7.5): Search › Cards on that set's cards. */
describe('SetCardsComponent', () => {
  let fixture: ComponentFixture<SetCardsComponent>;
  let element: HTMLElement;
  let searchCards: ReturnType<typeof vi.fn>;

  async function render(q = '') {
    searchCards = vi.fn(({ page }: { page: number }) =>
      of({
        items: [
          {
            id: `c${page}`,
            name: page === 0 ? 'Azure-Eyes Sky Dragon' : 'Lantern Fox Spirit',
            game: 'yugioh',
          },
        ],
        page,
        totalPages: 2,
      }),
    );
    TestBed.configureTestingModule({
      imports: [SetCardsComponent],
      providers: [
        provideRouter([]),
        {
          provide: CatalogService,
          useValue: {
            searchCards,
            getSet: () => of({ set: { id: 's1', code: 'AZR', name: 'Azure Dawn' } }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SetCardsComponent);
    fixture.componentRef.setInput('setId', 's1');
    fixture.componentRef.setInput('q', q);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists the cards of the set, every page with Load more, and no count', async () => {
    await render();
    expect(element.querySelector('[data-testid="set-chip"]')?.textContent).toContain(
      'Azure Dawn · AZR',
    );
    expect(element.querySelector('[data-testid="set-chip"]')?.getAttribute('aria-label')).toBe(
      'Show every card, not only AZR',
    );
    expect(searchCards).toHaveBeenCalledWith(
      { set: 's1', page: 0, size: 50 },
      'body',
      false,
      expect.anything(),
    );
    element.querySelector<HTMLButtonElement>('.sc__more')!.click();
    fixture.detectChanges();
    expect(
      [...element.querySelectorAll('[data-testid="set-card-row"] .sc__name')].map((row) =>
        row.textContent?.trim(),
      ),
    ).toEqual(['Azure-Eyes Sky Dragon', 'Lantern Fox Spirit']);
    expect(element.textContent).not.toMatch(/\d+ (cards|results)/);
  });

  it('filters by the text, says when nothing matches, and offers Try again on an error', async () => {
    await render('fox');
    expect(searchCards).toHaveBeenCalledWith(
      expect.objectContaining({ set: 's1', query: 'fox' }),
      'body',
      false,
      expect.anything(),
    );
    searchCards.mockReturnValueOnce(of({ items: [], page: 0, totalPages: 0 }));
    fixture.componentRef.setInput('q', 'zzz');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="set-cards-empty"]')?.textContent).toContain(
      'No card of AZR matches ‘zzz’.',
    );
    searchCards.mockReturnValueOnce(throwError(() => new Error('offline')));
    fixture.componentRef.setInput('q', 'yyy');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(element.textContent).toContain('The cards of this set could not load.');
    expect(element.querySelector('.sc__action')?.textContent).toContain('Try again');
  });

  it('names the chip by the set name and code', () => {
    expect(setChipLabel({ name: 'Azure Dawn', code: 'AZR' })).toBe('Azure Dawn · AZR');
    expect(setChipLabel({ code: 'AZR' })).toBe('AZR');
    expect(setChipLabel(null)).toBe('');
  });
});
