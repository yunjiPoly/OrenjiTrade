import { TestBed } from '@angular/core/testing';
import { CardDataAttributionComponent } from './card-data-attribution.component';
import { CARD_DATA_ATTRIBUTIONS, attributionFor } from './card-data-attributions';

describe('card data attributions', () => {
  it('credits YGOPRODeck and the Yu-Gi-Oh! rights holders (docs/providers/ygoprodeck.md)', () => {
    const yugioh = attributionFor('yugioh');
    expect(yugioh?.provider).toBe('YGOPRODeck');
    expect(yugioh?.providerUrl).toBe('https://ygoprodeck.com');
    expect(yugioh?.credit).toBe('Card data and images courtesy of');
    expect(yugioh?.notice).toContain('Konami Digital Entertainment, Inc.');
    expect(yugioh?.notice).toContain('© 4K Media Inc.');
    expect(attributionFor('pokemon')).toBeNull();
    expect(attributionFor(null)).toBeNull();
  });
});

describe('CardDataAttributionComponent', () => {
  async function render(game?: string | null): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(CardDataAttributionComponent);
    if (game !== undefined) {
      fixture.componentRef.setInput('game', game);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it("shows a game's provider credit with a safe external link", async () => {
    const element = await render('yugioh');
    const lines = element.querySelectorAll('[data-testid="card-data-attribution"]');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Card data and images courtesy of YGOPRODeck. Yu-Gi-Oh! is a trademark of Konami Digital ' +
        'Entertainment, Inc.; card content © 4K Media Inc. OrenjiTrade is not affiliated with ' +
        'Konami or 4K Media.',
    );
    const link = lines[0].querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://ygoprodeck.com');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows nothing for games without an external provider and everything in the footer', async () => {
    expect((await render('pokemon')).textContent?.trim()).toBe('');
    expect((await render(null)).textContent?.trim()).toBe('');
    expect((await render()).querySelectorAll('[data-testid="card-data-attribution"]')).toHaveLength(
      CARD_DATA_ATTRIBUTIONS.length,
    );
  });
});
