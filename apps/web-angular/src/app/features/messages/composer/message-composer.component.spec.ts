import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageDraft } from '../data/message-draft';
import { MessageComposerComponent } from './message-composer.component';

describe('MessageComposerComponent', () => {
  let fixture: ComponentFixture<MessageComposerComponent>;
  let element: HTMLElement;
  let drafts: MessageDraft[];
  let typing: number;

  beforeEach(async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(MessageComposerComponent);
    drafts = [];
    typing = 0;
    fixture.componentInstance.send.subscribe((draft) => drafts.push(draft));
    fixture.componentInstance.typing.subscribe(() => typing++);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.restoreAllMocks());

  function textarea(): HTMLTextAreaElement {
    return element.querySelector('textarea')!;
  }

  function sendButton(): HTMLButtonElement {
    return element.querySelector('button[aria-label="Send message"]')!;
  }

  async function type(text: string): Promise<void> {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  function press(key: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
    textarea().dispatchEvent(event);
    return event;
  }

  async function chooseFile(file: File): Promise<void> {
    const input = element.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  it('sends with Enter, adds a line with Shift+Enter and reports typing', async () => {
    expect(sendButton().disabled).toBe(true);
    await type('Hello Bea');
    expect(typing).toBe(1);
    expect(sendButton().disabled).toBe(false);
    expect(press('Enter', true).defaultPrevented).toBe(false);
    expect(drafts).toEqual([]);
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(drafts).toEqual([{ text: 'Hello Bea', attachment: null }]);
  });

  it('does not send blank text and is disabled while the conversation cannot receive messages', async () => {
    await type('   ');
    press('Enter');
    expect(drafts).toEqual([]);
    await type('Hi');
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(sendButton().disabled).toBe(true);
    press('Enter');
    expect(drafts).toEqual([]);
  });

  it('validates photos before attaching them and previews the chosen one', async () => {
    await chooseFile(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    expect(element.querySelector('[role=alert]')?.textContent).toContain(
      'Use a JPEG, PNG or WebP photo.',
    );
    expect(element.querySelector('[data-testid=composer-attachment]')).toBeNull();

    const photo = new File([new Uint8Array(2048)], 'binder.png', { type: 'image/png' });
    await chooseFile(photo);
    const attachment = element.querySelector('[data-testid=composer-attachment]');
    expect(attachment?.textContent).toContain('binder.png');
    expect(attachment?.textContent).toContain('2 KB');
    expect(attachment?.querySelector('img')?.getAttribute('alt')).toBe('Photo to send');
    expect(element.querySelector('[role=alert]')).toBeNull();
    // A photo alone can be sent.
    expect(sendButton().disabled).toBe(false);
    sendButton().click();
    expect(drafts[0].attachment).toMatchObject({ kind: 'image', file: photo });

    fixture.componentInstance.reset();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid=composer-attachment]')).toBeNull();
  });

  it('shows the send error of the thread', async () => {
    fixture.componentRef.setInput('error', 'You are sending messages too quickly.');
    await fixture.whenStable();
    expect(element.querySelector('[data-testid=send-error]')?.textContent).toContain('too quickly');
  });
});
