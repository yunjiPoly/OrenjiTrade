import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BulkAction } from '../data/bulk-actions';
import { binder, item } from '../testing/fixtures';
import { BulkDockComponent } from './bulk-dock.component';

describe('BulkDockComponent (spec 9.6)', () => {
  let fixture: ComponentFixture<BulkDockComponent>;
  let element: HTMLElement;
  let emitted: BulkAction[];

  beforeEach(async () => {
    fixture = TestBed.createComponent(BulkDockComponent);
    fixture.componentRef.setInput('count', 6);
    fixture.componentRef.setInput('selected', [item('a')]);
    fixture.componentRef.setInput('binders', [binder('y', { name: 'Trades' }), binder('p', { name: 'Pokédex', game: 'pokemon' })]);
    emitted = [];
    fixture.componentInstance.action.subscribe((action) => emitted.push(action));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  function button(text: string): HTMLButtonElement {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(text))!;
  }

  it('reads "6 selected" and offers the existing bulk actions, no Set price', () => {
    expect(element.textContent).toContain('6 selected');
    for (const label of ['Make public', 'Make private', 'Move to binder', 'Still have them', 'Delete', 'Clear']) {
      expect(button(label), label).toBeTruthy();
    }
    expect(element.textContent).not.toContain('Set price');
  });

  it('emits each action', () => {
    button('Make public').click();
    button('Make private').click();
    button('Still have them').click();
    button('Delete').click();
    expect(emitted).toEqual([
      { kind: 'visibility', visibility: 'PUBLIC' },
      { kind: 'visibility', visibility: 'PRIVATE' },
      { kind: 'confirm' },
      { kind: 'delete' },
    ]);
  });

  it('dims a binder of another game than every selected card', () => {
    const dock = fixture.componentInstance as unknown as { takes: (b: unknown) => boolean };
    expect(dock.takes(binder('y'))).toBe(true);
    expect(dock.takes(binder('p', { game: 'pokemon' }))).toBe(false);
  });

  it('turns the last actions into icons with their names at md', async () => {
    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();
    expect(element.querySelector('[aria-label="Still have them"]')).toBeTruthy();
    expect(element.querySelector('[aria-label="Delete"]')).toBeTruthy();
  });
});
