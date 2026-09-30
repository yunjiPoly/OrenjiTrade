import { TestBed } from '@angular/core/testing';
import { GameMetadataField } from '@orenji/api-client';
import { CardMetadataComponent } from './card-metadata.component';

describe('CardMetadataComponent', () => {
  function render(
    fields: GameMetadataField[] | null,
    metadata: Record<string, unknown>,
  ): HTMLElement {
    const fixture = TestBed.createComponent(CardMetadataComponent);
    fixture.componentRef.setInput('fields', fields);
    fixture.componentRef.setInput('metadata', metadata);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the attributes with the labels and order of the game schema', () => {
    const element = render(
      [
        { key: 'attribute', label: 'Attribute', type: 'string' },
        { key: 'atk', label: 'ATK', type: 'number' },
        { key: 'types', label: 'Types', type: 'string_list' },
      ] as GameMetadataField[],
      { atk: 3000, attribute: 'LIGHT', types: ['Dragon', 'Normal'] },
    );
    const labels = Array.from(element.querySelectorAll('dt'), (dt) => dt.textContent?.trim());
    expect(labels).toEqual(['Attribute', 'ATK', 'Types']);
    expect(element.querySelector('[data-key="atk"] dd')?.textContent?.trim()).toBe('3,000');
    const chips = Array.from(element.querySelectorAll('[data-key="types"] .meta__chip'), (chip) =>
      chip.textContent?.trim(),
    );
    expect(chips).toEqual(['Dragon', 'Normal']);
  });

  it('shows values without a schema readably and an empty state when there are none', () => {
    expect(render(null, { manaValue: 3 }).querySelector('dt')?.textContent?.trim()).toBe(
      'Mana value',
    );
    expect(render(null, {}).textContent).toContain('No attributes recorded');
  });
});
