import { LiveAnnouncer } from '@angular/cdk/a11y';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PostResponse } from '@orenji/api-client';
import { AppConfigService } from '../../../core/config/app-config.service';
import { ShellLayout } from '../../../core/layout/shell-layout.service';
import { RoomStore } from '../data/room.store';
import { fixturePost } from '../testing/community-fixtures';
import { PostActionEvent, RoomPostComponent } from './room-post.component';

const QUEBEC = {
  regionCode: 'americas-north',
  countryCode: 'CA',
  countryName: 'Canada',
  subdivisionCode: 'CA-QC',
  subdivisionName: 'Quebec',
  label: 'Quebec, Canada',
};

describe('RoomPostComponent (spec 10.7, board W22)', () => {
  let fixture: ComponentFixture<RoomPostComponent>;
  let element: HTMLElement;
  const isModerator = signal(false);
  const narrow = signal(false);

  function render(post: PostResponse, day = 'Today'): void {
    TestBed.configureTestingModule({
      imports: [RoomPostComponent],
      providers: [
        provideRouter([]),
        {
          provide: RoomStore,
          useValue: { selfId: signal('me'), isModerator, update: vi.fn(async () => null) },
        },
        { provide: AppConfigService, useValue: { apiBaseUrl: () => '' } },
        { provide: ShellLayout, useValue: { narrow } },
      ],
    });
    fixture = TestBed.createComponent(RoomPostComponent);
    fixture.componentRef.setInput('post', post);
    fixture.componentRef.setInput('game', 'yugioh');
    fixture.componentRef.setInput('day', day);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  async function menuItems(): Promise<string[]> {
    element.querySelector<HTMLButtonElement>('[data-testid="post-more"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    return [...document.querySelectorAll('.mat-mdc-menu-panel [mat-menu-item]')].map(
      (item) => item.textContent?.trim() ?? '',
    );
  }

  afterEach(() => {
    narrow.set(false);
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('shows the handle, "{province} · {time}", the text, and is named for screen readers', () => {
    render(
      fixturePost('a', new Date(2026, 9, 30, 9, 12).toISOString(), {
        author: { id: 'maya', handle: 'maya_k', displayName: 'Maya Kim' },
        body: 'Who else is building Snake-Eye?',
        place: QUEBEC,
      }),
    );
    expect(element.querySelector('.post__handle')?.textContent?.trim()).toBe('maya_k');
    expect(element.querySelector('.post__handle')?.getAttribute('href')).toBe('/collectors/maya_k');
    expect(element.querySelector('.post__meta')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Quebec · 9:12 AM',
    );
    expect(element.querySelector('.post__text')?.textContent).toBe(
      'Who else is building Snake-Eye?',
    );
    expect(element.querySelector('article')?.getAttribute('aria-label')).toBe(
      'maya_k, Quebec, 9:12 AM',
    );
    // Never a display name, a city or a coordinate.
    expect(element.textContent).not.toContain('Maya Kim');
    expect(element.textContent).not.toMatch(/\bkm\b|\d+\.\d{3,}/);
  });

  it('the time alone when the author shares no place; the day in the label before today', () => {
    render(fixturePost('a', new Date(2026, 9, 28, 20, 15).toISOString()), 'Yesterday');
    expect(element.querySelector('.post__meta')?.textContent?.trim()).toBe('8:15 PM');
    expect(element.querySelector('article')?.getAttribute('aria-label')).toBe(
      'handle_a, Yesterday 8:15 PM',
    );
  });

  it('"⋯" on someone else\'s post: Message, Report this post and Block, after a divider', async () => {
    render(fixturePost('a', '2026-10-30T09:00:00Z'));
    const events: PostActionEvent[] = [];
    fixture.componentInstance.action.subscribe((event) => events.push(event));
    expect(element.querySelector('[data-testid="post-more"]')?.getAttribute('aria-label')).toBe(
      'More for the post by handle_a',
    );
    expect(await menuItems()).toEqual(['Message handle_a', 'Report this post', 'Block handle_a']);
    expect(document.querySelector('.mat-mdc-menu-panel [role="separator"]')).not.toBeNull();
    document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-panel [mat-menu-item]')[2].click();
    expect(events.map((event) => event.action)).toEqual(['block']);
    expect(events[0].post.id).toBe('a');
  });

  it('one\'s own post says "You" and offers Edit and Delete; a moderator may remove others\'', async () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        author: { id: 'me', handle: 'sam', displayName: 'Sam' },
        canEdit: true,
        canDelete: true,
      }),
    );
    expect(element.querySelector('.post__you')?.textContent).toBe('You');
    expect(element.querySelector('article')?.getAttribute('aria-label')).toContain('sam (you)');
    expect(await menuItems()).toEqual(['Edit', 'Delete']);
  });

  it('saving an edited post says "Post saved" politely (WF leftover A9)', async () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        author: { id: 'me', handle: 'sam', displayName: 'Sam' },
        canEdit: true,
        canDelete: true,
      }),
    );
    const announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce').mockResolvedValue();
    await menuItems();
    document.querySelector<HTMLButtonElement>('.mat-mdc-menu-panel [mat-menu-item]')!.click();
    fixture.detectChanges();
    const editor = element.querySelector<HTMLTextAreaElement>('.post__edit-text')!;
    editor.value = 'An edited post';
    editor.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('.post__edit')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(TestBed.inject(RoomStore).update).toHaveBeenCalledWith('a', 'An edited post');
    expect(announce).toHaveBeenCalledWith('Post saved', 'polite');
  });

  it('a moderator sees "Remove (moderator)" on someone else\'s post', async () => {
    isModerator.set(true);
    render(fixturePost('a', '2026-10-30T09:00:00Z'));
    expect(await menuItems()).toContain('Remove (moderator)');
    isModerator.set(false);
  });

  it('a shared card opens Who has this card on that printing', () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        payload: {
          card: { id: 'pr-7', cardId: 'c-7', name: 'Snake-Eye Ash', printingCode: 'AGOV-EN007' },
        },
      }),
    );
    const card = element.querySelector('[data-testid="post-card"]')!;
    expect(card.textContent).toContain('Snake-Eye Ash');
    expect(card.textContent).toContain('AGOV-EN007');
    const view = card.querySelector('a')!;
    expect(view.getAttribute('href')).toBe('/cards/c-7?printing=pr-7');
    expect(view.getAttribute('aria-label')).toBe('View Snake-Eye Ash, who has this card');
  });

  it('a shared deck core shows its badge and price; a binder gone reads "no longer available"', () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        payload: {
          binder: {
            id: 'b-1',
            name: 'Yubel core',
            ownerHandle: 'duelist',
            deckCore: true,
            askingPriceText: '$95',
          },
        },
      }),
    );
    const core = element.querySelector('[data-testid="post-deck-core"]')!;
    expect(core.textContent).toContain('Deck core');
    // The price alone: the post's data names no game, and the core may be of another game than
    // the room's (WF review F5).
    expect(core.querySelector('.share__line')?.textContent?.trim()).toBe('$95');
    expect(core.textContent).not.toContain('Yu-Gi-Oh!');
    expect(core.querySelector('a')?.getAttribute('href')).toBe('/binders/b-1');
    fixture.componentRef.setInput(
      'post',
      fixturePost('b', '2026-10-30T09:00:00Z', { payload: { binderUnavailable: true } }),
    );
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="post-binder-gone"]')?.textContent).toContain(
      'Binder no longer available',
    );
    expect(element.querySelector('[data-testid="post-binder-gone"] a')).toBeNull();
  });

  it('a public binder reads "Public binder", without the room\'s game (WF review F5)', () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        payload: {
          binder: { id: 'b-2', name: 'Singles for sale', ownerHandle: 'collector5' },
        },
      }),
    );
    const binder = element.querySelector('[data-testid="post-binder"]')!;
    expect(binder.querySelector('.share__line')?.textContent?.trim()).toBe('Public binder');
    expect(binder.textContent).not.toContain('Yu-Gi-Oh!');
  });

  it('a post that shares a card and a deck core shows both (WF review U2)', () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        payload: {
          card: { id: 'pr-1', cardId: 'c-1', name: 'Lantern Fox Spirit', printingCode: 'LFS-001' },
          binder: {
            id: 'b-1',
            name: 'Moth Queen core',
            ownerHandle: 'collector2',
            deckCore: true,
            askingPriceText: '$40',
          },
        },
      }),
    );
    expect(element.querySelector('[data-testid="post-card"]')?.textContent).toContain(
      'Lantern Fox Spirit',
    );
    expect(element.querySelector('[data-testid="post-deck-core"]')?.textContent).toContain(
      'Moth Queen core',
    );
  });

  it('below 960 the "⋯" menu is a bottom sheet, as "+" (spec 16, WF review U6)', async () => {
    narrow.set(true);
    render(fixturePost('a', '2026-10-30T09:00:00Z'));
    await menuItems();
    const panel = document.querySelector('.mat-mdc-menu-panel')!;
    expect(panel.classList).toContain('app-menu--sheet');
    expect(panel.classList).toContain('app-more-menu');
  });

  it("shows a phone's photos read only, each opening the larger view", () => {
    render(
      fixturePost('a', '2026-10-30T09:00:00Z', {
        payload: {
          photos: [
            { url: '/api/v1/public/community-photos/1', width: 800, height: 600 },
            { url: '/api/v1/public/community-photos/2', width: 800, height: 600 },
          ],
        },
      }),
    );
    const opened: number[] = [];
    fixture.componentInstance.photoOpened.subscribe((event) => opened.push(event.index));
    const group = element.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('2 photos from handle_a');
    const buttons = group.querySelectorAll('button');
    expect(buttons[1].getAttribute('aria-label')).toBe('Photo 2 of 2 from handle_a. Open larger');
    buttons[1].click();
    expect(opened).toEqual([1]);
  });
});
