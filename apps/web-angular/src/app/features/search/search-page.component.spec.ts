import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UnifiedSearchBoxComponent } from '../../shared/search/unified-search-box/unified-search-box.component';
import { CardHoldersComponent } from './card-holders/card-holders.component';
import { UnifiedResultsComponent } from './results/unified-results.component';
import { SearchPageComponent } from './search-page.component';

@Component({ selector: 'app-card-holders', template: '<p>Card holders</p>' })
class FakeCardHoldersComponent {
  readonly target = input<unknown>();
  readonly filters = input<unknown>();
  readonly returnUrl = input('');
  readonly filtersChange = output<unknown>();
}

@Component({ selector: 'app-unified-results', template: '<p>Results</p>' })
class FakeUnifiedResultsComponent {
  readonly q = input('');
  readonly tab = input<unknown>();
  readonly tabChange = output<unknown>();
}

@Component({ selector: 'app-unified-search-box', template: '' })
class FakeUnifiedSearchBoxComponent {
  readonly label = input('');
  readonly value = input('');
  readonly keepSelection = input(false);
  readonly picked = output<unknown>();
  readonly submitted = output<string>();
}

/** Anything of the removed ads or Premium (stage F1, "free for all", ADR 0019). */
const PAID = /sponsored|premium|upgrade/i;
const PLACEMENT = 'app-sponsored-slot, [data-testid*="sponsored"], [class*="sponsored"]';

describe('SearchPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [provideRouter([])],
    });
    TestBed.overrideComponent(SearchPageComponent, {
      remove: {
        imports: [CardHoldersComponent, UnifiedResultsComponent, UnifiedSearchBoxComponent],
      },
      add: {
        imports: [
          FakeCardHoldersComponent,
          FakeUnifiedResultsComponent,
          FakeUnifiedSearchBoxComponent,
        ],
      },
    });
  });

  function mount(query: Record<string, string>): HTMLElement {
    const fixture = TestBed.createComponent(SearchPageComponent);
    for (const [key, value] of Object.entries(query)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the results of a search without a sponsored placement', () => {
    const element = mount({ q: 'azure' });
    expect(element.querySelector('app-unified-results')).not.toBeNull();
    expect(element.textContent).not.toMatch(PAID);
    expect(element.querySelector(PLACEMENT)).toBeNull();
  });

  it('shows the holders of a card without a sponsored placement', () => {
    const element = mount({ card: '00000000-0000-4000-8a00-000000000001' });
    expect(element.querySelector('app-card-holders')).not.toBeNull();
    expect(element.textContent).not.toMatch(PAID);
    expect(element.querySelector(PLACEMENT)).toBeNull();
  });

  it('invites a search when there is no query, with nothing to buy', () => {
    const element = mount({});
    expect(element.textContent).toContain('Who in your region has that card?');
    expect(element.textContent).not.toMatch(PAID);
    expect(element.querySelector(PLACEMENT)).toBeNull();
  });
});
