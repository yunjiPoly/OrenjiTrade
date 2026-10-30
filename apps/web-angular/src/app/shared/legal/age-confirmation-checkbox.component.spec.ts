import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import {
  AGE_CONFIRMATION_LABEL_EN,
  AgeConfirmationCheckboxComponent,
} from './age-confirmation-checkbox.component';

@Component({
  imports: [AgeConfirmationCheckboxComponent],
  template: `<app-age-confirmation-checkbox [control]="control" [warn]="warn()" />`,
})
class Host {
  readonly control = new FormControl(false, {
    nonNullable: true,
    validators: Validators.requiredTrue,
  });
  readonly warn = signal(false);
}

describe('AgeConfirmationCheckboxComponent (spec 14, board W27)', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('is a native checkbox named in English only, never ticked by default (owner, 2026-10-20)', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    const box = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(false);
    expect(element.querySelector('label')?.textContent?.trim()).toBe(AGE_CONFIRMATION_LABEL_EN);
    expect(element.querySelector('[lang="fr"]')).toBeNull();
    box.click();
    expect(fixture.componentInstance.control.value).toBe(true);
  });

  it('is ringed in amber after a refused press while unticked', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.age--warn')).toBeNull();
    fixture.componentInstance.warn.set(true);
    fixture.detectChanges();
    expect(element.querySelector('.age--warn')).not.toBeNull();
  });
});
