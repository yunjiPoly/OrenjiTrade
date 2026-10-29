import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { SendDetailData, SendDetailDialogComponent } from './send-detail-dialog.component';

/** Decision 9: the address and the e-Transfer email are typed each time and never saved. */
describe('SendDetailDialogComponent (web WC, spec 10.3, decision 9)', () => {
  let fixture: ComponentFixture<SendDetailDialogComponent>;
  let element: HTMLElement;
  let send: ReturnType<typeof vi.fn<(text: string) => Promise<string | null>>>;
  let close: ReturnType<typeof vi.fn>;
  let storageWrites: string[];

  async function open(
    kind: SendDetailData['kind'],
    answer: string | null = null,
    side: SendDetailData['side'] = 'buying',
  ): Promise<void> {
    send = vi.fn<(text: string) => Promise<string | null>>(() => Promise.resolve(answer));
    close = vi.fn();
    const ref = { close, beforeClosed: () => new Subject<void>() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: ref },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            kind,
            other: 'theo.duels',
            subject: 'Yubel core',
            side,
            send,
          } satisfies SendDetailData,
        },
      ],
    });
    fixture = TestBed.createComponent(SendDetailDialogComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    storageWrites = [];
    for (const storage of [localStorage, sessionStorage]) {
      vi.spyOn(storage, 'setItem').mockImplementation((key: string) => {
        storageWrites.push(key);
      });
    }
  });

  afterEach(() => vi.restoreAllMocks());

  function field(): HTMLInputElement | HTMLTextAreaElement {
    return element.querySelector('[data-testid="send-detail-input"]')!;
  }

  function sendButton(): HTMLButtonElement {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes('Send in this chat'),
    )!;
  }

  async function type(text: string): Promise<void> {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('never tells the seller that the buyer ships their own card (WC review F3)', async () => {
    await open('address', null, 'selling');
    expect(element.textContent).toContain('Share your address in this chat if theo.duels needs it.');
    expect(element.textContent).not.toContain('ships');
  });

  it('sends the typed address once, says nothing is kept, and stores nothing anywhere', async () => {
    await open('address');
    expect(element.textContent).toContain('Send my address');
    expect(element.textContent).toContain('theo.duels ships the Yubel core there, with tracking.');
    expect(element.textContent).toContain(
      'OrenjiTrade doesn’t keep this. It goes only into this chat, where you and theo.duels can see it.',
    );
    expect(field().getAttribute('autocomplete')).toBe('off');
    expect(sendButton().disabled).toBe(true);

    await type('Sam Tremblay\n12 rue des Cartes\nMontréal, QC H2X 1Y4');
    expect(element.querySelector('[data-testid="send-detail-preview"]')?.textContent).toContain(
      'Ship to:',
    );
    sendButton().click();
    await fixture.whenStable();

    expect(send).toHaveBeenCalledWith(
      'Ship to:\nSam Tremblay\n12 rue des Cartes\nMontréal, QC H2X 1Y4',
    );
    expect(close).toHaveBeenCalledWith(true);
    // Never written to the browser's storage (decision 9).
    expect(storageWrites).toEqual([]);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('rue des Cartes');
  });

  it('checks the e-Transfer email, sends it with Enter and keeps the dialog open on a refusal', async () => {
    await open('etransfer', 'This collector cannot receive messages right now.');
    expect(element.textContent).toContain('Send my e-Transfer email');
    await type('sam@example');
    field().dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(element.textContent).toContain('Write an email address, like name@example.com.');
    expect(sendButton().disabled).toBe(true);

    await type('sam@example.com');
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    await fixture.whenStable();
    expect(send).toHaveBeenCalledWith('e-Transfer to sam@example.com');
    expect(close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'This collector cannot receive messages right now.',
    );
    expect(storageWrites).toEqual([]);
  });
});
