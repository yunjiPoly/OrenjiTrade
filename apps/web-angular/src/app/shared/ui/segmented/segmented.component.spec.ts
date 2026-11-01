import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SegmentedComponent } from './segmented.component';

describe('SegmentedComponent', () => {
  let fixture: ComponentFixture<SegmentedComponent>;
  let element: HTMLElement;
  let chosen: string[];

  beforeEach(async () => {
    fixture = TestBed.createComponent(SegmentedComponent);
    fixture.componentRef.setInput('label', 'Price in');
    fixture.componentRef.setInput('options', [
      { value: 'usd', label: '$', spoken: 'Dollars' },
      { value: 'pct', label: '% TCG' },
    ]);
    fixture.componentRef.setInput('value', 'usd');
    chosen = [];
    fixture.componentInstance.valueChange.subscribe((value) => chosen.push(value));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  it('is a labelled radio group with one tab stop on the chosen option', () => {
    expect(element.getAttribute('role')).toBe('radiogroup');
    expect(element.getAttribute('aria-label')).toBe('Price in');
    const radios = element.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-label')).toBe('Dollars');
    expect([radios[0].tabIndex, radios[1].tabIndex]).toEqual([0, -1]);
  });

  it('chooses with a click or the arrow keys', () => {
    const radios = element.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[1].click();
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(chosen).toEqual(['pct', 'pct', 'pct']);
  });
});
