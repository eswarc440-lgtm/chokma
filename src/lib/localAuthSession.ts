import { auth } from './firebase';

export interface LocalAuthUser {
  uid: string;
  username: string;
  displayName: string;
  email: string;
}

// Stored strictly in memory (never localStorage or sessionStorage)
let inMemorySessionToken: string | null = null;

export function setLocalSessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

export function getLocalSessionToken(): string | null {
  return inMemorySessionToken;
}

/**
 * Returns the active Bearer token for backend API & WebSocket calls:
 * prefers the in-memory server-signed session token when signed in with Username + Password,
 * otherwise retrieves the Firebase Auth ID token.
 */
export async function getActiveAuthToken(): Promise<string> {
  if (inMemorySessionToken) {
    return inMemorySessionToken;
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to continue.');
  }
  return currentUser.getIdToken();
}

export function hasActiveAuthSession(): boolean {
  return Boolean(inMemorySessionToken || auth.currentUser);
}

async function parseAuthResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Authentication failed (${res.status})`);
  }
  return data as T;
}

export async function localRegisterAccount(payload: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ token: string; user: LocalAuthUser }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseAuthResponse<{ token: string; user: LocalAuthUser }>(res);
  setLocalSessionToken(data.token);
  return data;
}

export async function localLoginAccount(payload: {
  username: string;
  password: string;
}): Promise<{ token: string; user: LocalAuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await parseAuthResponse<{ token: string; user: LocalAuthUser }>(res);
  setLocalSessionToken(data.token);
  return data;
}

export async function localDemoLogin(personaId: 'cloud' | 'fullstack' | 'data'): Promise<{
  token: string;
  user: LocalAuthUser & { personaId: 'cloud' | 'fullstack' | 'data' };
}> {
  const res = await fetch('/api/auth/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId }),
  });
  const data = await parseAuthResponse<{
    token: string;
    user: LocalAuthUser & { personaId: 'cloud' | 'fullstack' | 'data' };
  }>(res);
  setLocalSessionToken(data.token);
  return data;
}

export async function localLogoutAccount(): Promise<void> {
  const token = inMemorySessionToken;
  setLocalSessionToken(null);
  if (!token) return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Ignore network logout error once local memory token is cleared
  }
}
