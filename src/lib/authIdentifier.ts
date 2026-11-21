import type { User } from 'firebase/auth';

export const USERNAME_EMAIL_DOMAIN = 'users.chokma.app';
const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;

export function isUsernameAccountEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

/**
 * Determines whether a signed-in Firebase Auth user can enter the Chokma workspace.
 * - Google sign-in and verified real email accounts have `emailVerified === true`.
 * - Username + Password accounts use the internal synthetic domain (`@users.chokma.app`)
 *   which cannot receive verification emails and are validated as authenticated owners.
 */
export function canAccessWorkspace(user: User | null): boolean {
  if (!user) return false;
  return Boolean(user.emailVerified || isUsernameAccountEmail(user.email));
}

/**
 * Resolves a user-entered Username (e.g. "alex_dev") OR Email address into a Firebase Auth email.
 */
export function resolveAuthIdentifier(rawInput: string): {
  firebaseEmail: string;
  isUsername: boolean;
  displayUsername: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Please enter a username or email address.');
  }

  if (trimmed.includes('@')) {
    const lower = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
      throw new Error('Please enter a valid email address or a username without spaces.');
    }
    return {
      firebaseEmail: lower,
      isUsername: isUsernameAccountEmail(lower),
      displayUsername: trimmed.split('@')[0],
    };
  }

  if (!USERNAME_REGEX.test(trimmed)) {
    throw new Error(
      'Username must be 3–30 characters using only letters, numbers, dots, underscores, or hyphens.'
    );
  }

  return {
    firebaseEmail: `${trimmed.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`,
    isUsername: true,
    displayUsername: trimmed,
  };
}

/**
 * Formats an account identifier cleanly for display in the UI.
 * Synthetic username emails are shown as `@username`; real emails are shown as-is.
 */
export function formatAccountIdentifier(email?: string | null): string {
  if (!email) return '';
  if (isUsernameAccountEmail(email)) {
    return `@${email.split('@')[0]}`;
  }
  return email;
}
