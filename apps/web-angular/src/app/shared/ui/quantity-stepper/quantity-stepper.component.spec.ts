import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuantityStepperComponent } from './quantity-stepper.component';

describe('QuantityStepperComponent', () => {
  let fixture: ComponentFixture<QuantityStepperComponent>;
  let element: HTMLElement;
  let emitted: number[];

  function button(name: string): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>(`button[aria-label^="${name}"]`)!;
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(QuantityStepperComponent);
    fixture.componentRef.setInput('value', 2);
    fixture.componentRef.setInput('label', 'Lantern Fox Spirit');
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  it('labels its buttons with the card name and emits the next quantity', () => {
    expect(element.querySelector('[role=group]')?.getAttribute('aria-label')).toBe(
      'Quantity of Lantern Fox Spirit',
    );
    button('Increase').click();
    button('Decrease').click();
    expect(emitted).toEqual([3, 1]);
  });

  it('never goes below one copy, and keeps the focus on a button at its limit', async () => {
    fixture.componentRef.setInput('value', 1);
    await fixture.whenStable();
    expect(button('Decrease').getAttribute('aria-disabled')).toBe('true');
    expect(button('Decrease').disabled).toBe(false);
    expect(button('Increase').getAttribute('aria-disabled')).toBeNull();
    button('Decrease').focus();
    button('Decrease').click();
    expect(emitted).toEqual([]);
    expect(document.activeElement).toBe(button('Decrease'));

    fixture.componentRef.setInput('max', 1);
    await fixture.whenStable();
    button('Increase').click();
    expect(emitted).toEqual([]);
    expect(button('Increase').getAttribute('aria-disabled')).toBe('true');
  });

  it('turns both buttons off while an update is pending', async () => {
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(button('Decrease').getAttribute('aria-disabled')).toBe('true');
    expect(button('Increase').getAttribute('aria-disabled')).toBe('true');
    button('Increase').click();
    expect(emitted).toEqual([]);
  });
});
