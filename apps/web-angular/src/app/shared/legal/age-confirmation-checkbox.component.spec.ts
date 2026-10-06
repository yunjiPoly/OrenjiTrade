import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import {
  AGE_CONFIRMATION_ERROR,
  AGE_CONFIRMATION_LABEL_EN,
  AGE_CONFIRMATION_LABEL_FR,
  AgeConfirmationCheckboxComponent,
} from './age-confirmation-checkbox.component';

@Component({
  imports: [AgeConfirmationCheckboxComponent],
  template: `<app-age-confirmation-checkbox [control]="control" [showError]="showError()" />`,
})
class HostComponent {
  readonly control = new FormControl(false, {
    nonNullable: true,
    validators: Validators.requiredTrue,
  });
  readonly showError = signal(false);
}

describe('AgeConfirmationCheckboxComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  function input(): HTMLInputElement {
    return element.querySelector<HTMLInputElement>('[data-testid="age-confirmation"] input')!;
  }

  it('is unticked by default and shows the English and French statements', () => {
    expect(input().checked).toBe(false);
    expect(fixture.componentInstance.control.value).toBe(false);
    expect(fixture.componentInstance.control.invalid).toBe(true);
    expect(element.textContent).toContain(AGE_CONFIRMATION_LABEL_EN);
    expect(element.textContent).toContain(AGE_CONFIRMATION_LABEL_FR);
    expect(element.querySelector('[lang="fr"]')?.textContent).toContain(AGE_CONFIRMATION_LABEL_FR);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('ticking it makes the control valid', () => {
    input().click();
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe(true);
    expect(fixture.componentInstance.control.valid).toBe(true);
  });

  it('announces the validation message when the parent asks for it', () => {
    fixture.componentInstance.showError.set(true);
    fixture.detectChanges();
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(AGE_CONFIRMATION_ERROR);
    expect(element.querySelector('.age')?.getAttribute('aria-describedby')).toBe(
      'age-confirmation-error',
    );
  });
});
