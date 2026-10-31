import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { ListingsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { ChatDrawer } from '../../shared/messaging/chat-drawer.service';
import { ReportActionsService } from '../../shared/reports/report-actions.service';
import { IHaveIt } from '../../shared/wishlist/i-have-it.service';
import { WishlistActions } from '../../shared/wishlist/wishlist-actions.service';
import { SessionService } from '../auth/session.service';
import { ToastService } from '../feedback/toast.service';
import { finishGuestAction } from './guest-finish';

const OWNER = { id: 'u-owner', handle: 'maya_k', displayName: 'Maya', avatarUrl: null };

describe("finishing a guest's action after sign-in (spec 14; the phone's R15)", () => {
  let owner: ReturnType<typeof vi.fn>;
  let message: ReturnType<typeof vi.fn>;
  let offer: ReturnType<typeof vi.fn>;
  let add: ReturnType<typeof vi.fn>;
  let report: ReturnType<typeof vi.fn>;
  let toast: ReturnType<typeof vi.fn>;
  const myId = signal<string | null>('u-me');

  beforeEach(() => {
    owner = vi.fn(() => of(OWNER));
    message = vi.fn(async () => undefined);
    offer = vi.fn(async () => undefined);
    add = vi.fn(async () => null);
    report = vi.fn(async () => null);
    toast = vi.fn();
    myId.set('u-me');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ListingsService, useValue: { getListingOwner: owner } },
        { provide: ChatDrawer, useValue: { message } },
        { provide: IHaveIt, useValue: { offer } },
        { provide: WishlistActions, useValue: { add } },
        { provide: ReportActionsService, useValue: { report } },
        { provide: ToastService, useValue: { show: toast } },
        { provide: SessionService, useValue: { me: () => ({ id: myId() }) } },
      ],
    });
  });

  it('"Message": the chat drawer with the owner, the card or deck core pinned', async () => {
    await finishGuestAction(
      { kind: 'message', listing: { itemId: 'i-1' } },
      TestBed.inject(Injector),
      null,
    );
    expect(owner).toHaveBeenCalledWith({ itemId: 'i-1' }, 'body', false, expect.anything());
    expect(message).toHaveBeenCalledWith({ recipientId: 'u-owner', subjectItemId: 'i-1' }, null);
    await finishGuestAction(
      { kind: 'message', listing: { binderId: 'b-1' } },
      TestBed.inject(Injector),
      null,
    );
    expect(message).toHaveBeenLastCalledWith(
      { recipientId: 'u-owner', subjectBinderId: 'b-1' },
      null,
    );
    await finishGuestAction(
      { kind: 'message', listing: { binderId: 'b-2' }, pin: false },
      TestBed.inject(Injector),
      null,
    );
    expect(message).toHaveBeenLastCalledWith({ recipientId: 'u-owner' }, null);
  });

  it('"I have it", a profile, a wish and a report finish as a member\'s would', async () => {
    const card = { cardId: 'c-1', name: 'Ash Blossom' };
    await finishGuestAction({ kind: 'have', wishId: 'w-1', card }, TestBed.inject(Injector), null);
    expect(owner).toHaveBeenLastCalledWith({ wishId: 'w-1' }, 'body', false, expect.anything());
    expect(offer).toHaveBeenCalledWith('u-owner', card, null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await finishGuestAction(
      { kind: 'profile', listing: { binderId: 'b-1' } },
      TestBed.inject(Injector),
      null,
    );
    expect(navigate).toHaveBeenCalledWith(['/collectors', 'maya_k']);
    await finishGuestAction(
      { kind: 'wish', cardId: 'c-1', printingId: 'p-1' },
      TestBed.inject(Injector),
      null,
    );
    expect(add).toHaveBeenCalledWith({ cardId: 'c-1', printingId: 'p-1', rarity: undefined });
    await finishGuestAction({ kind: 'report', binderId: 'b-9' }, TestBed.inject(Injector), null);
    expect(report).toHaveBeenCalledWith(
      { id: 'u-owner', displayName: 'Maya', handle: 'maya_k', avatarUrl: null },
      { source: 'BINDER', binderId: 'b-9' },
    );
  });

  it("a listing gone in between, or one's own, says so instead", async () => {
    owner.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    await finishGuestAction(
      { kind: 'message', listing: { itemId: 'i-1' } },
      TestBed.inject(Injector),
      null,
    );
    expect(message).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: 'That listing is no longer available.',
      tone: 'error',
    });
    myId.set('u-owner');
    await finishGuestAction(
      { kind: 'message', listing: { itemId: 'i-1' } },
      TestBed.inject(Injector),
      null,
    );
    expect(message).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith({ title: 'That’s one of your own listings.' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await finishGuestAction(
      { kind: 'profile', listing: { itemId: 'i-1' } },
      TestBed.inject(Injector),
      null,
    );
    expect(navigate).toHaveBeenCalledWith(['/profile']);
  });
});
