import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ConversationParticipantOnlineStatusEnum as Online,
  ConversationSummary,
  MessagingService,
} from '@orenji/api-client';
import { Subject, throwError } from 'rxjs';
import { ApiError } from '../../core/http/api-error';
import { ConversationStarterService } from './conversation-starter.service';

const CONVERSATION: ConversationSummary = {
  id: 'c1',
  other: { id: 'u1', handle: 'bea', displayName: 'Bea', onlineStatus: Online.Hidden },
  unreadCount: 0,
  muted: false,
  archived: false,
  createdAt: '2026-09-30T10:00:00Z',
};

describe('ConversationStarterService', () => {
  let service: ConversationStarterService;
  let startConversation: ReturnType<typeof vi.fn>;
  let open: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    startConversation = vi.fn();
    open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MessagingService, useValue: { startConversation } },
        { provide: MatSnackBar, useValue: { open } },
      ],
    });
    service = TestBed.inject(ConversationStarterService);
  });

  it('opens (or creates) the conversation and tracks progress per recipient', async () => {
    const answer = new Subject<ConversationSummary>();
    startConversation.mockReturnValue(answer);
    const pending = service.start('u1');
    expect(service.starting()).toBe('u1');
    expect(startConversation).toHaveBeenCalledWith(
      { startConversationRequest: { recipientId: 'u1' } },
      'body',
      false,
      expect.anything(),
    );
    answer.next(CONVERSATION);
    answer.complete();
    expect(await pending).toEqual(CONVERSATION);
    expect(service.starting()).toBeNull();
  });

  it('explains a refusal and resolves null', async () => {
    startConversation.mockReturnValue(
      throwError(
        () =>
          new ApiError({
            errorCode: 'MESSAGING_BLOCKED',
            message: 'blocked',
            requestId: null,
            status: 403,
            fieldErrors: {},
          }),
      ),
    );
    expect(await service.start('u1')).toBeNull();
    expect(open.mock.calls[0][0]).toContain('Messaging unavailable');
    expect(service.starting()).toBeNull();
  });
});
