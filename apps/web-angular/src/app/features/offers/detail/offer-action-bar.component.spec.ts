import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OfferActionBarComponent } from './offer-action-bar.component';

describe('OfferActionBarComponent', () => {
  let fixture: ComponentFixture<OfferActionBarComponent>;
  let element: HTMLElement;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(OfferActionBarComponent);
    fixture.componentRef.setInput('otherName', 'Ben Buyer');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function labels(): string[] {
    return [...element.querySelectorAll('button')].map(
      (button) =>
        button.textContent?.replace(/\s+/g, ' ').trim().split(' ').slice(1).join(' ') ?? '',
    );
  }

  it('shows the answers of the party whose turn it is', async () => {
    await render({ allowedActions: ['ACCEPT', 'COUNTER', 'DECLINE'], yourTurn: true });
    expect(element.textContent).toContain('Your turn to answer');
    expect(labels()).toEqual(['Accept', 'Counter', 'Decline', 'Message Ben Buyer']);
    let emitted = 0;
    fixture.componentInstance.acceptRequested.subscribe(() => emitted++);
    element.querySelector('button')?.click();
    expect(emitted).toBe(1);
  });

  it('lets the buyer withdraw while waiting, and disables answers while one is sent', async () => {
    await render({ allowedActions: ['CANCEL'], waiting: true, busy: 'CANCEL' });
    expect(element.textContent).toContain('Waiting for Ben Buyer');
    expect(labels()).toEqual(['Withdrawing…', 'Message Ben Buyer']);
    expect(element.querySelector('button')?.disabled).toBe(true);
  });

  it('says when the negotiation is closed', async () => {
    await render({ allowedActions: [] });
    expect(element.textContent).toContain('This negotiation is closed');
    expect(labels()).toEqual(['Message Ben Buyer']);
  });
});
