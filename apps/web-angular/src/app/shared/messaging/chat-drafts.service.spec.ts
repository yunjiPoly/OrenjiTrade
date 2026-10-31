import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthChange, AuthService } from '../../core/auth/auth.service';
import type { AuthUser } from '../../core/auth/firebase-auth.port';
import { ChatDrafts } from './chat-drafts.service';

describe('ChatDrafts (web WC, spec 10.6)', () => {
  let drafts: ChatDrafts;
  let changes: Subject<AuthChange>;

  function identity(uid: string | null, idToken = uid ? `token-${uid}` : null): void {
    changes.next({ user: uid ? ({ uid } as AuthUser) : null, idToken });
  }

  beforeEach(() => {
    changes = new Subject<AuthChange>();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { user: signal({ uid: 'uid-1' } as AuthUser), changes$: changes },
        },
      ],
    });
    drafts = TestBed.inject(ChatDrafts);
  });

  it('keeps one draft per chat, in memory', () => {
    drafts.set('chat-a', 'Half a thought');
    drafts.set('chat-b', 'Another');
    expect(drafts.get('chat-a')).toBe('Half a thought');
    drafts.clear('chat-a');
    expect(drafts.get('chat-a')).toBe('');
    expect(drafts.get('chat-b')).toBe('Another');
    expect(drafts.get(null)).toBe('');
  });

  it('forgets every draft when the account signs out or another signs in (WC review F1, P1)', () => {
    drafts.set('chat-a', 'UNSENT-DRAFT-OF-COLLECTOR2');
    // A token refresh of the same account keeps the drafts.
    identity('uid-1', 'token-refreshed');
    expect(drafts.get('chat-a')).toBe('UNSENT-DRAFT-OF-COLLECTOR2');

    identity(null);
    expect(drafts.get('chat-a')).toBe('');

    drafts.set('chat-a', 'Draft of the second account');
    identity('uid-2');
    expect(drafts.get('chat-a')).toBe('');
  });
});
