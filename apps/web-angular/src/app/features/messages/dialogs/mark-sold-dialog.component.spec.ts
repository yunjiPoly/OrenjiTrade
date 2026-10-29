import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConversationSubject, DealsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { MarkSoldData, MarkSoldDialogComponent } from './mark-sold-dialog.component';

const SUBJECT = {
  kind: 'CARD',
  id: 'item-1',
  ownerId: 'seller',
  name: 'Ash Blossom & Joyous Spring',
  printingCode: 'RA01-EN008',
  rarity: 'Secret Rare',
  sold: false,
  listed: true,
  copies: 2,
} as ConversationSubject;

describe('MarkSoldDialogComponent (web WC, spec 10.5, board W19)', () => {
  let fixture: ComponentFixture<MarkSoldDialogComponent>;
  let element: HTMLElement;
  let markSold: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  async function open(subject: ConversationSubject = SUBJECT): Promise<void> {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { conversationId: 'c1', subject, buyer: 'theo.duels' } satisfies MarkSoldData,
        },
        { provide: DealsService, useValue: { markSold } },
      ],
    });
    fixture = TestBed.createComponent(MarkSoldDialogComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    markSold = vi.fn(() => of({ id: 'sale-1', undoableUntil: '2026-10-20T12:10:00Z' }));
  });

  function sentence(): string {
    return element.querySelector('[data-testid="mark-sold-sentence"]')?.textContent?.trim() ?? '';
  }

  function button(name: string): HTMLButtonElement {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === name || b.getAttribute('aria-label')?.startsWith(name),
    )!;
  }

  async function track(text: string): Promise<void> {
    const input = element.querySelector<HTMLInputElement>('[data-testid="tracking-input"]')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('sells the chosen copies with the tracking number and the subject shown', async () => {
    await open();
    expect(element.textContent).toContain('Mark as sold?');
    expect(element.textContent).toContain('RA01-EN008 · Secret Rare');
    expect(sentence()).toContain('You keep 1 copy in your inventory.');

    button('Increase quantity').click();
    await fixture.whenStable();
    expect(sentence()).toContain('It was your last copy');
    // Up to the copies held.
    expect(button('Increase quantity').disabled).toBe(true);

    await track('  1Z999AA1  0123456784 ');
    button('Mark as sold').click();
    await fixture.whenStable();
    expect(markSold).toHaveBeenCalledWith(
      {
        id: 'c1',
        markSoldRequest: {
          quantity: 2,
          trackingNumber: '1Z999AA1 0123456784',
          subjectItemId: 'item-1',
        },
      },
      'body',
      false,
      expect.anything(),
    );
    expect(close).toHaveBeenCalledWith({ sale: expect.objectContaining({ id: 'sale-1' }) });
  });

  it('refuses a bad tracking number before sending and keeps refusals in the dialog', async () => {
    await open();
    await track('1Z/999');
    expect(element.textContent).toContain('Use letters, digits, spaces, dots and dashes only.');
    expect(button('Mark as sold').disabled).toBe(true);

    await track('');
    markSold.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'NOTHING_LEFT_TO_SELL', status: 409, message: 'x' },
          }),
      ),
    );
    button('Mark as sold').click();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="mark-sold-error"]')?.textContent).toContain(
      'Nothing left to sell',
    );
    expect(close).not.toHaveBeenCalled();
  });

  it('closes with the news when the buyer pinned another listing (409 SUBJECT_CHANGED)', async () => {
    markSold.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'SUBJECT_CHANGED', status: 409, message: 'x' },
          }),
      ),
    );
    await open();
    button('Mark as sold').click();
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith({
      changed: true,
      message:
        'theo.duels opened another of your listings. Check the card above, then mark it sold.',
    });
  });

  it('sells a deck core as one, naming the binder', async () => {
    await open({
      ...SUBJECT,
      kind: 'DECK_CORE' as ConversationSubject['kind'],
      id: 'binder-9',
      printingCode: null,
      copies: null,
    });
    expect(element.querySelector('app-quantity-stepper')).toBeNull();
    expect(sentence()).toContain('The deck core and its cards leave Search');
    button('Mark as sold').click();
    await fixture.whenStable();
    expect(markSold.mock.calls[0][0].markSoldRequest).toEqual({
      quantity: 1,
      subjectBinderId: 'binder-9',
    });
  });
});
