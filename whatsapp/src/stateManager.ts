import { DEFAULT_LOCALE, Locale } from './locale';

export enum UserState {
  UNVERIFIED = 'UNVERIFIED',
  AWAITING_OTP = 'AWAITING_OTP',
  AWAITING_CUSTODIAL_CONSENT = 'AWAITING_CUSTODIAL_CONSENT',
  VERIFIED = 'VERIFIED'
}

export interface ConversationSession {
  state: UserState;
  locale: Locale;
  lastMessageTime: number;
  messageCount: number;
  rateLimitWindowStart: number;
}

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes session inactivity timeout
const RATE_LIMIT_MAX_MESSAGES = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

const sessions = new Map<string, ConversationSession>();

/** Read the language for a rate-limited reply without extending the session. */
export function getSessionLocale(phoneHash: string): Locale {
  const session = sessions.get(phoneHash);
  return session && Date.now() - session.lastMessageTime <= SESSION_TIMEOUT_MS
    ? session.locale
    : DEFAULT_LOCALE;
}

/**
 * Retrieves session for phone hash, resetting if timed out.
 */
export function getSession(phoneHash: string): ConversationSession {
  const now = Date.now();
  let session = sessions.get(phoneHash);

  if (!session) {
    session = {
      state: UserState.UNVERIFIED,
      locale: DEFAULT_LOCALE,
      lastMessageTime: now,
      messageCount: 0,
      rateLimitWindowStart: now
    };
    sessions.set(phoneHash, session);
    return session;
  }

  // Session timeout check
  if (now - session.lastMessageTime > SESSION_TIMEOUT_MS) {
    session.state = UserState.UNVERIFIED;
    session.locale = DEFAULT_LOCALE;
    session.messageCount = 0;
    session.rateLimitWindowStart = now;
  }

  session.lastMessageTime = now;
  return session;
}

/**
 * Updates user state in session.
 */
export function updateState(phoneHash: string, newState: UserState): void {
  const session = getSession(phoneHash);
  session.state = newState;
  sessions.set(phoneHash, session);
}

/**
 * Enforces per-phone rate limiting.
 */
export function checkRateLimit(phoneHash: string): boolean {
  const now = Date.now();
  const session = getSession(phoneHash);

  if (now - session.rateLimitWindowStart > RATE_LIMIT_WINDOW_MS) {
    session.rateLimitWindowStart = now;
    session.messageCount = 1;
    return true;
  }

  session.messageCount += 1;
  return session.messageCount <= RATE_LIMIT_MAX_MESSAGES;
}
