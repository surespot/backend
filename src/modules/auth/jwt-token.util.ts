/**
 * Every JWT in this app is signed with the same secret, so the claims decide what a token is for:
 *  - access token:   { sub, role, type: 'access' }
 *  - refresh token:  { sub, role, family, type: 'refresh' }
 *  - one-off tokens: { phone | email, purpose } (signup, password reset, bootstrap, ...)
 *
 * Only an access token may authenticate API calls or sockets. Tokens issued before the `type`
 * claim existed are told apart by shape: old refresh tokens carry `family`, one-off tokens
 * carry `purpose`, and old access tokens have neither, so sessions that are already signed in
 * keep working.
 */
export interface TokenClaims {
  sub?: string;
  type?: string;
  family?: string;
  purpose?: string;
}

export function isAccessTokenPayload(payload: TokenClaims | null | undefined): boolean {
  if (!payload || typeof payload.sub !== 'string' || !payload.sub) return false;
  if (payload.type !== undefined && payload.type !== 'access') return false;
  if (payload.family !== undefined) return false;
  if (payload.purpose !== undefined) return false;
  return true;
}
