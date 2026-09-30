import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { StarRatingInputComponent } from './star-rating-input.component';

@Component({
  imports: [ReactiveFormsModule, StarRatingInputComponent],
  template: `<app-star-rating-input [formControl]="score" label="Shipping" clearable />`,
})
class HostComponent {
  readonly score = new FormControl<number | null>(null);
}

describe('StarRatingInputComponent', () => {
  async function create(value: number | null = null) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.score.setValue(value);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const stars = () => [...element.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    return { fixture, element, stars };
  }

  it('is a labelled radio group of five stars with one tab stop', async () => {
    const { element, stars } = await create();
    expect(element.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe(
      'Shipping',
    );
    expect(stars().map((star) => star.getAttribute('aria-label'))).toEqual([
      '1 star, Poor',
      '2 stars, Fair',
      '3 stars, Good',
      '4 stars, Great',
      '5 stars, Excellent',
    ]);
    expect(stars().map((star) => star.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
    ]);
  });

  it('writes the clicked score to the form and moves the tab stop', async () => {
    const { fixture, stars } = await create();
    stars()[3].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.score.value).toBe(4);
    expect(stars()[3].getAttribute('aria-checked')).toBe('true');
    expect(stars()[3].getAttribute('tabindex')).toBe('0');
  });

  it('follows the arrow, Home and End keys', async () => {
    const { fixture, stars } = await create(3);
    stars()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.score.value).toBe(4);
    stars()[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.score.value).toBe(1);
    stars()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.score.value).toBe(1);
    stars()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.score.value).toBe(5);
  });

  it('clears an optional score and follows a disabled control', async () => {
    const { fixture, element, stars } = await create(2);
    const clear = [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Clear',
    );
    expect(clear?.getAttribute('aria-label')).toBe('Clear Shipping');
    clear?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.score.value).toBeNull();
    fixture.componentInstance.score.disable();
    await fixture.whenStable();
    expect(stars().every((star) => star.disabled)).toBe(true);
  });
});
