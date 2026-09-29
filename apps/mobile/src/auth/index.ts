export {
  AUTH_ERROR_MESSAGES,
  AuthError,
  describeAuthError,
  isAuthError,
  toAuthError,
} from './authErrors';
export {
  FirebaseConfigError,
  getFirebaseApp,
  getFirebaseAuth,
  getFirebaseAuthModule,
  readAuthEmulatorHost,
  readFirebaseConfig,
  readFirebaseEnv,
  type FirebaseAuthModule,
  type FirebaseEnvConfig,
  type FirebaseEnvInput,
} from './firebase';
export { RequireSession, type RequireSessionProps } from './RequireSession';
export {
  GOOGLE_SIGN_IN_AVAILABLE,
  SessionProvider,
  useSession,
  type Session,
  type SessionStatus,
  type SessionUser,
} from './session';
export {
  initialSessionState,
  sessionReducer,
  toSessionUser,
  type FirebaseUserLike,
  type SessionAction,
  type SessionState,
} from './sessionReducer';
export {
  EMAIL_PATTERN,
  MIN_DISPLAY_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  completeRegistration,
  hasSignUpErrors,
  validateSignUp,
  waitForMe,
  type CompleteRegistrationDeps,
  type CompleteRegistrationResult,
  type SignUpErrors,
  type SignUpForm,
} from './signUp';
export { getIdToken, setIdTokenProvider, type IdTokenProvider } from './tokenProvider';
