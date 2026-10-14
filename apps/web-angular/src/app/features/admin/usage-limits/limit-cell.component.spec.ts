import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminUsageLimit } from '@orenji/api-client';
import { LimitCellComponent, LimitEdit } from './limit-cell.component';

const LIMIT = {
  id: 'l1',
  key: 'binder.views.per_day',
  window: 'DAY',
  maxValue: 30,
  unlimited: false,
} as AdminUsageLimit;

describe('LimitCellComponent', () => {
  let fixture: ComponentFixture<LimitCellComponent>;
  let element: HTMLElement;
  let edits: LimitEdit[];

  function button(label: string): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  beforeEach(() => {
    edits = [];
    fixture = TestBed.createComponent(LimitCellComponent);
    fixture.componentRef.setInput('limit', LIMIT);
    fixture.componentRef.setInput('label', 'Public binder views per day');
    fixture.componentRef.setInput('canEdit', true);
    fixture.componentInstance.edit.subscribe((edit) => edits.push(edit));
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the value with its window', () => {
    expect(element.textContent).toContain('30');
    expect(element.textContent).toContain('per day');
    expect(element.querySelector('[data-testid="limit-binder.views.per_day"]')).not.toBeNull();
  });

  it('edits inline and emits a valid value', () => {
    button('Edit Public binder views per day').click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('input[type=number]')!;
    input.value = '45';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(edits).toEqual([{ limit: LIMIT, unlimited: false, maxValue: 45 }]);
  });

  it('shows a validation message instead of emitting an invalid value', () => {
    button('Edit Public binder views per day').click();
    fixture.detectChanges();
    const input = element.querySelector<HTMLInputElement>('input[type=number]')!;
    input.value = '-2';
    input.dispatchEvent(new Event('input'));
    button('Save Public binder views per day').click();
    fixture.detectChanges();
    expect(edits).toEqual([]);
    expect(element.querySelector('[role=alert]')?.textContent).toContain('Use 0 or more.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('closes when the saved limit comes back, and hides editing from read-only admins', () => {
    button('Edit Public binder views per day').click();
    fixture.detectChanges();
    fixture.componentRef.setInput('limit', { ...LIMIT, maxValue: 45 });
    fixture.detectChanges();
    expect(element.querySelector('input')).toBeNull();
    expect(element.textContent).toContain('45');

    fixture.componentRef.setInput('canEdit', false);
    fixture.detectChanges();
    expect(button('Edit Public binder views per day')).toBeNull();
  });
});
