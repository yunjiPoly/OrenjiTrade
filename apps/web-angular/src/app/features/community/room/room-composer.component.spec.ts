import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { ChatDrafts } from '../../../shared/messaging/chat-drafts.service';
import { RoomComposerComponent, RoomDraft } from './room-composer.component';

describe('RoomComposerComponent (spec 10.7, board W22)', () => {
  let fixture: ComponentFixture<RoomComposerComponent>;
  let element: HTMLElement;
  let drafts: Map<string, string>;
  let posted: RoomDraft[];

  function render(): void {
    drafts = new Map();
    TestBed.configureTestingModule({
      imports: [RoomComposerComponent],
      providers: [
        { provide: ShellLayout, useValue: { narrow: signal(false) } },
        {
          provide: ChatDrafts,
          useValue: {
            get: (key: string) => drafts.get(key) ?? '',
            set: (key: string, text: string) => drafts.set(key, text),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(RoomComposerComponent);
    fixture.componentRef.setInput('roomName', 'Yu-Gi-Oh!');
    fixture.componentRef.setInput('slug', 'americas-north-yugioh');
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
    posted = [];
    fixture.componentInstance.post.subscribe((draft) => posted.push(draft));
  }

  function field(): HTMLTextAreaElement {
    return element.querySelector('textarea')!;
  }

  function type(text: string): void {
    field().value = text;
    field().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function button(): HTMLButtonElement {
    return element.querySelector<HTMLButtonElement>('[data-testid="room-post-button"]')!;
  }

  it('names the field and the button after the room; the button waits for text', () => {
    render();
    expect(element.querySelector('label')?.textContent).toBe('Write to the Yu-Gi-Oh! room');
    expect(field().placeholder).toBe('Write to the room');
    expect(button().getAttribute('aria-label')).toBe('Post to the Yu-Gi-Oh! room');
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(element.textContent).toContain('Enter to post · Shift+Enter for a new line');
    button().click();
    expect(posted).toEqual([]);
    type('   ');
    expect(button().getAttribute('aria-disabled')).toBe('true');
    type('Who else plays Snake-Eye?');
    expect(button().getAttribute('aria-disabled')).toBeNull();
    expect(button().classList).toContain('rc__post--ready');
  });

  it('Enter posts and Shift+Enter makes a new line; the draft is kept per room', () => {
    render();
    type('Line one');
    expect(drafts.get('room:americas-north-yugioh')).toBe('Line one');
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(posted).toEqual([]);
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(posted).toEqual([{ text: 'Line one', attachments: [] }]);
    fixture.componentInstance.reset();
    fixture.detectChanges();
    expect(field().value).toBe('');
    expect(drafts.get('room:americas-north-yugioh')).toBe('');
  });

  it('what the picker chose waits above the field, removable, and goes with the post', () => {
    render();
    fixture.componentInstance.attach({
      kind: 'binder',
      binder: { binderId: 'b-1', name: 'Snake-Eye core', itemCount: 12 },
      deckCore: true,
      price: '$180',
    });
    fixture.detectChanges();
    const tray = element.querySelector('[role="group"]')!;
    expect(tray.getAttribute('aria-label')).toBe('Added to your post');
    expect(tray.textContent).toContain('Snake-Eye core');
    expect(tray.textContent).toContain('Deck core · $180');
    type('My core');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(posted[0].attachments.map((item) => item.kind)).toEqual(['binder']);
    const remove = tray.querySelector<HTMLButtonElement>('button')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove Snake-Eye core from your post');
    remove.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="group"]')).toBeNull();
  });

  it('a card and a binder go together, as on the phone (WF review U4)', () => {
    render();
    const component = fixture.componentInstance;
    component.attach({
      kind: 'binder',
      binder: { binderId: 'b-1', name: 'Snake-Eye core', itemCount: 12 },
      deckCore: true,
      price: '$180',
    });
    component.attach({
      kind: 'card',
      card: {
        printingId: 'pr-1',
        cardId: 'c-1',
        name: 'Ash Blossom',
        printingCode: 'MACR-EN036',
        imageUrl: null,
        game: 'yugioh',
      },
    });
    fixture.detectChanges();
    const chips = [...element.querySelectorAll('[role="group"] .rc__chip-name')].map((node) =>
      node.textContent?.trim(),
    );
    expect(chips).toEqual(['Ash Blossom', 'Snake-Eye core']);
    type('Both');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(posted[0].attachments.map((item) => item.kind)).toEqual(['card', 'binder']);
    // Removing one keeps the other.
    element
      .querySelector<HTMLButtonElement>('[aria-label="Remove Ash Blossom from your post"]')!
      .click();
    fixture.detectChanges();
    expect(element.querySelector('[role="group"]')?.textContent).toContain('Snake-Eye core');
    expect(element.querySelector('[role="group"]')?.textContent).not.toContain('Ash Blossom');
  });

  it('shows a refusal, with "Try again" after a network error only', () => {
    render();
    const retried: unknown[] = [];
    fixture.componentInstance.retry.subscribe(() => retried.push(true));
    fixture.componentRef.setInput('error', 'You already posted this.');
    fixture.detectChanges();
    const error = element.querySelector('[data-testid="room-post-error"]')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('You already posted this.');
    expect(error.querySelector('button')).toBeNull();
    fixture.componentRef.setInput('error', 'Your post was not sent. Check your connection.');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="room-post-error"] button')!.click();
    expect(retried).toHaveLength(1);
  });

  it('near the limit it counts the characters', () => {
    render();
    type('x'.repeat(1850));
    expect(element.querySelector('.rc__hint')?.textContent?.trim()).toBe('1850 / 2000 characters');
  });
});
