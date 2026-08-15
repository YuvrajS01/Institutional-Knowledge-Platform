const ACCESS_TOKEN_KEY = 'ikp.access_token';
const REFRESH_TOKEN_KEY = 'ikp.refresh_token';
const INSTITUTION_ID_KEY = 'ikp.institution_id';

export interface Session {
  accessToken: string;
  refreshToken: string;
  institutionId: string;
}

export function getSession(): Session | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const institutionId = localStorage.getItem(INSTITUTION_ID_KEY);
  if (!accessToken || !refreshToken || !institutionId) {
    return null;
  }
  return { accessToken, refreshToken, institutionId };
}

export function setSession(session: Session): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  localStorage.setItem(INSTITUTION_ID_KEY, session.institutionId);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(INSTITUTION_ID_KEY);
}
