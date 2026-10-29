import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChatDrafts } from '../../../shared/messaging/chat-drafts.service';
import { MessageDraft } from '../data/message-draft';
import { ComposerAction, MessageComposerComponent } from './message-composer.component';

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

  function press(key: string, shiftKey = false, ctrlKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, shiftKey, ctrlKey, cancelable: true });
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

  it('shows "Not sent" with "Try again", which sends the kept draft again', async () => {
    await type('Still there?');
    fixture.componentRef.setInput('error', 'This collector cannot receive messages right now.');
    await fixture.whenStable();
    const error = element.querySelector('[data-testid=send-error]');
    expect(error?.textContent).toContain('Not sent');
    expect(error?.textContent).toContain('This collector cannot receive messages right now.');
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Try again')!
      .click();
    expect(drafts).toEqual([{ text: 'Still there?', attachment: null }]);
  });

  it('retries a failed quick reply, not the text in the field (WC review F6, U10)', async () => {
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);
    // An empty field still offers "Try again" for the reply.
    fixture.componentRef.setInput('error', 'Please try again in a moment.');
    fixture.componentRef.setInput('retryReply', true);
    await fixture.whenStable();
    const tryAgain = () =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === 'Try again',
      );
    expect(tryAgain()).toBeDefined();
    await type('Something else entirely');
    tryAgain()!.click();
    expect(retries).toBe(1);
    expect(drafts).toEqual([]);
  });

  it('sends with Ctrl/Cmd+Enter too, even with Shift (spec 4.9)', async () => {
    await type('Hello');
    expect(press('Enter', true, true).defaultPrevented).toBe(true);
    expect(drafts).toHaveLength(1);
  });

  it('offers the quick replies of the side and the "+" menu rows as actions', async () => {
    const replies: string[] = [];
    const actions: ComposerAction[] = [];
    fixture.componentInstance.quickReply.subscribe((text) => replies.push(text));
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    fixture.componentRef.setInput('replies', ['e-Transfer sent!', 'Thanks!']);
    await fixture.whenStable();
    const chips = [...element.querySelectorAll<HTMLButtonElement>('.quick__chip')];
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['e-Transfer sent!', 'Thanks!']);
    expect(chips[0].getAttribute('aria-label')).toBe('Send “e-Transfer sent!”');
    chips[0].click();
    expect(replies).toEqual(['e-Transfer sent!']);
    // While a message is on its way the chips stay focusable but do nothing (WC review A1).
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(chips[1].disabled).toBe(false);
    expect(chips[1].getAttribute('aria-disabled')).toBe('true');
    chips[1].click();
    expect(replies).toEqual(['e-Transfer sent!']);
    fixture.componentRef.setInput('busy', false);
    await fixture.whenStable();

    element.querySelector<HTMLButtonElement>('[data-testid=composer-plus]')!.click();
    await fixture.whenStable();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.plus-menu [mat-menu-item]')];
    const labels = items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(labels).toHaveLength(5);
    expect(labels[0]).toContain('Send my address');
    expect(labels[0]).toContain('Typed each time. Never saved on the web.');
    expect(labels[1]).toContain('Send my e-Transfer email');
    expect(labels[2]).toContain('Send a photo');
    expect(labels[2]).toContain('JPEG, PNG or WebP, up to 8 MB');
    expect(labels[3]).toContain('Share a card from your inventory');
    expect(labels[4]).toContain('Share a binder');
    items[0].click();
    expect(actions).toEqual(['address']);

    // No quick replies while the chat cannot receive messages.
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(element.querySelectorAll('.quick__chip')).toHaveLength(0);
  });

  it('holds a card or binder chosen in the picker as an attachment, sent with the text (WC review U6)', async () => {
    fixture.componentInstance.attach({
      kind: 'item',
      itemId: 'item-9',
      name: 'Lantern Fox Spirit',
    });
    await fixture.whenStable();
    expect(element.querySelector('[data-testid=composer-attachment]')?.textContent).toContain(
      'Lantern Fox Spirit',
    );
    expect(drafts).toEqual([]);
    await type('Would you trade for this one?');
    press('Enter');
    expect(drafts).toEqual([
      {
        text: 'Would you trade for this one?',
        attachment: { kind: 'item', itemId: 'item-9', name: 'Lantern Fox Spirit' },
      },
    ]);
    // It can be removed before Send.
    element.querySelector<HTMLButtonElement>('[aria-label="Remove attachment"]')!.click();
    await fixture.whenStable();
    expect(element.querySelector('[data-testid=composer-attachment]')).toBeNull();
  });

  it('keeps a draft per chat in memory, never in the browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    fixture.componentRef.setInput('draftKey', 'chat-a');
    await fixture.whenStable();
    await type('Half a thought');
    fixture.componentRef.setInput('draftKey', 'chat-b');
    await fixture.whenStable();
    expect(textarea().value).toBe('');
    fixture.componentRef.setInput('draftKey', 'chat-a');
    await fixture.whenStable();
    expect(textarea().value).toBe('Half a thought');
    expect(TestBed.inject(ChatDrafts).get('chat-a')).toBe('Half a thought');
    fixture.componentInstance.reset();
    expect(TestBed.inject(ChatDrafts).get('chat-a')).toBe('');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('attaches a dropped photo and puts a question in the field', async () => {
    const photo = new File([new Uint8Array(1024)], 'drop.webp', { type: 'image/webp' });
    expect(fixture.componentInstance.attachFile(photo)).toBe(true);
    await fixture.whenStable();
    expect(element.querySelector('[data-testid=composer-attachment]')?.textContent).toContain(
      'drop.webp',
    );
    expect(
      fixture.componentInstance.attachFile(new File(['x'], 'a.gif', { type: 'image/gif' })),
    ).toBe(false);
    fixture.componentInstance.prefill(
      'Could you add your Effect Veiler ($4.50) to the same package?',
    );
    await fixture.whenStable();
    expect(textarea().value).toContain('Effect Veiler');
    expect(document.activeElement).toBe(textarea());
  });
});
