/**
 * Compatibility re-export: the implementation moved to `session.tsx` when Firebase was wired
 * (Phase 1). Existing imports of `@/src/auth/SessionProvider` keep working.
 */
export {
  SessionProvider,
  useSession,
  type Session,
  type SessionStatus,
  type SessionUser,
} from './session';
